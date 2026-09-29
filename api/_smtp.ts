/**
 * The mail transport, over SMTP.
 *
 * `node:net` and `node:tls` rather than a client library, for the same reason
 * the SQL layer avoids a driver: the standard library is enough, and a
 * dependency that talks to a financial platform's mailbox is a dependency to
 * audit.
 *
 * Two things this file is careful about, both of them because mail leaves the
 * system:
 *
 * **A message never blocks a money movement.** Nothing here is called from a
 * service that credits, debits or confirms anything. The caller writes to
 * `notification_outbox` and returns; this module is reached by a separate step,
 * later, on its own. A queue that is full, a server that is down, a password
 * that rotated overnight — none of it may stop a deposit from being confirmed.
 *
 * **No authentication code ever travels in a body.** §20 forbids it, and the
 * database enforces it: `assert_email_body_is_safe` refuses a body holding six
 * consecutive digits, or two groups of three separated by a space, which is
 * the display form of a six-digit code. The same shape would refuse a real
 * sentence — "6 mois" and "24 heures" pass, "123 456" does not.
 */

/** What a message is, once the template has been rendered. */
export interface Message {
  to: string;
  subject: string;
  text: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  fromName: string;
  /** `465` is implicit TLS, `587` is STARTTLS. */
  secure: boolean;
}

/** Reads the transport settings, refusing to start without them. */
export const smtpConfig = (): SmtpConfig => {
  const lire = (nom: string): string => process.env[nom]?.trim() ?? "";

  const config: SmtpConfig = {
    host: lire("SMTP_HOST"),
    port: Number(lire("SMTP_PORT") || 465),
    user: lire("SMTP_USER"),
    password: lire("SMTP_PASSWORD"),
    from: lire("SMTP_FROM"),
    fromName: lire("SMTP_FROM_NAME") || "Invest.ma",
    secure: lire("SMTP_SECURE").toLowerCase() !== "false",
  };

  const manquant = (["host", "user", "password", "from"] as const).filter(
    (cle) => !config[cle],
  );
  if (manquant.length > 0) {
    throw new Error(
      `SMTP is not configured: missing ${manquant
        .map((m) => `SMTP_${m.toUpperCase()}`)
        .join(", ")}. Mail is a separate step from the money, so the platform runs ` +
        "without it — but nothing will be delivered.",
    );
  }

  return config;
};

const DELAI = 30_000;

/** Base64 without a dependency, for AUTH and for the encoded word of a name. */
const base64 = (texte: string): string => Buffer.from(texte, "utf-8").toString("base64");

/**
 * Encodes a header that may hold a non-ASCII name, as RFC 2047 requires.
 * `From: Invest.ma` is ASCII and passes through; `From: Plateforme
 * d'investissement` does not, and an unencoded one is refused by most
 * receiving servers.
 */
const encoderEntete = (nom: string): string =>
  /^[\x20-\x7e]*$/.test(nom) ? nom : `=?UTF-8?B?${base64(nom)}?=`;

/**
 * Takes the final line of one reply off the front of a buffer.
 *
 * A reply is a series of `NNN-` lines ended by one `NNN `. Only the last one
 * answers the question that was asked, and the buffer may hold no complete
 * line yet — a packet boundary can fall anywhere, including the middle of one.
 *
 * Returns `null` when more data is needed, which is not a failure: a `data`
 * event will come. Throws only when the exchange has genuinely gone
 * off-script, where reading further would hang.
 *
 * Exported because this is the part worth testing. A reply reader that stops
 * one line short does not announce itself: the client waits for an answer the
 * server already sent, the server gives up first, and the `421 timeout` that
 * arrives twenty seconds later names neither the cause nor the step.
 */
export const lireReponse = (
  tampon: string,
  prefixe: string,
): { ligne: string; reste: string } | null => {
  // The buffer is shortened as lines are consumed. A continuation that did not
  // advance it would be read again, matched again, and skipped again, for as
  // long as the process runs — a loop that pegs the CPU and never returns, so
  // the caller waits on a reply that was in hand from the start.
  let reste = tampon;

  for (;;) {
    const index = reste.indexOf("\n");
    if (index === -1) return null;

    const ligne = reste.slice(0, index).replace(/\r$/, "");
    reste = reste.slice(index + 1);

    // A continuation line is answered by the *last* line of the group.
    // Matching the prefix loosely would accept the wrong one — the last line
    // of an EHLO is `250 CHUNKING`, which starts with `250` — and the exchange
    // would be read one step behind, answering a question never asked.
    if (ligne === prefixe || ligne.startsWith(`${prefixe} `)) return { ligne, reste };

    // A refusal: `421`, `535`. It is a real answer, and the caller must be
    // told what it said rather than wait for the line it did not get.
    if (/^[45]\d\d[ -]/.test(ligne)) {
      throw new Error(`SMTP: refused — ${ligne.slice(0, 90)}`);
    }

    // A `NNN-` line belongs to this reply and is not the end of it.
    if (/^\d{3}-/.test(ligne)) continue;

    throw new Error(`SMTP: unexpected reply "${ligne.slice(0, 60)}"`);
  }
};

export interface SendResult {
  /** The server's reply, kept in the queue as a trace of what happened. */
  response: string;
}

/**
 * Sends one message and returns the server's reply.
 *
 * Throws on refusal. The caller is the worker, which records the error and
 * reschedules — the retry belongs to the queue, not to the transport, and a
 * transport that retried on its own would send twice.
 */
export const sendMail = async (message: Message): Promise<SendResult> => {
  const { connect } = await import("node:net");
  const { connect: connectTls } = await import("node:tls");
  const config = smtpConfig();

  const socket = config.secure
    ? connectTls(config.port, config.host, { servername: config.host })
    : connect(config.port, config.host);

  // Lines are cut from a buffer, not read per event: a reply can arrive in
  // two packets, and treating each as a line would see half of a line.
  let tampon = "";
  socket.setTimeout(DELAI);
  socket.on("data", (fragment: Buffer | string) => {
    tampon += typeof fragment === "string" ? fragment : fragment.toString("utf-8");
  });

  /**
   * Waits for one reply, whenever it happens to arrive.
   *
   * The greeting can land before the socket is even connected, and any later
   * reply can be split across two packets. Reading without waiting turns both
   * into a timeout, which says nothing about why.
   */
  const lireLigne = (prefixe: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const tenter = () => {
        for (;;) {
          let lu;
          try {
            lu = lireReponse(tampon, prefixe);
          } catch (erreur) {
            cleanup();
            // A failure has to travel as a rejection. Letting it throw out of a
            // `data` listener would surface it as an uncaught exception with
            // no link to the step that produced it, and would leave the caller
            // waiting on an answer it already has.
            reject(erreur);
            return;
          }
          if (lu === null) return;
          tampon = lu.reste;
          cleanup();
          resolve(lu.ligne);
          return;
        }
      };

      const cleanup = () => {
        socket.off("data", surDonnee);
        clearTimeout(minuteur);
      };
      const surDonnee = () => tenter();

      const minuteur = setTimeout(() => {
        cleanup();
        reject(new Error(`SMTP: timed out waiting for ${prefixe}`));
      }, DELAI);

      socket.on("data", surDonnee);
      tenter();
    });

  const ecrire = (ligne: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(`${ligne}\r\n`, (erreur) => (erreur ? reject(erreur) : resolve()));
    });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("ready", resolve);
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("SMTP: connection timed out"));
      });
    });

    await lireLigne("220");
    await ecrire("EHLO invest.local");
    await lireLigne("250");

    // `AUTH` is advertised by every host worth talking to, and a server that
    // does not offer it is a server we do not hand a password to.
    await ecrire("AUTH LOGIN");
    await lireLigne("334");
    await ecrire(base64(config.user));
    await lireLigne("334");
    await ecrire(base64(config.password));
    const auth = await lireLigne("235");

    await ecrire(`MAIL FROM:<${config.from}>`);
    await lireLigne("250");
    await ecrire(`RCPT TO:<${message.to}>`);
    await lireLigne("250");
    await ecrire("DATA");
    await lireLigne("354");

    /*
      The message is assembled here, by hand, because a hand-built message is
      the only one whose content is known: no hidden header, no template that
      injects something. A library would add a `Message-ID` and a
      `Content-Transfer-Encoding` nobody decided on, and a header is a place
      where a value can be forged.
    */
    const corps = [
      `From: ${encoderEntete(config.fromName)} <${config.from}>`,
      `To: ${message.to}`,
      `Subject: ${encoderEntete(message.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
    ].join("\r\n");

    // A line holding only a dot ends the body in SMTP, so dots are doubled —
    // a version string in the text would otherwise truncate the message.
    const donnees = corps.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");

    // Written raw, not through `ecrire`: that helper appends CRLF, and the
    // terminating dot needs the line break to come *before* it. Going through
    // it leaves a blank line between the body and the dot, which the server
    // reads as a corrupt message and drops after its own timeout.
    socket.write(`${donnees}\r\n.\r\n`);
    const envoye = await lireLigne("250");

    await ecrire("QUIT").catch(() => {
      /* the server may have closed the connection on its own */
    });

    return { response: `${auth.slice(0, 20)} | ${envoye.slice(0, 40)}` };
  } finally {
    socket.destroy();
  }
};
