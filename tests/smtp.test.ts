/**
 * The SMTP reply reader, on replies a real server actually sent.
 *
 * Every string below was recorded from `smtp.hostinger.com` during the
 * connection that finally worked. The one that matters most is the EHLO
 * answer: it is nine lines long, and a reader that gives up before the ninth
 * does not fail loudly. It stops one line short, then waits for an answer the
 * server has already sent — and the server, having said everything it had to
 * say, hangs up first. The `421 timeout` that arrives twenty seconds later
 * names neither the cause nor the step, and the client looks broken rather
 * than incomplete.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { lireReponse } from "../api/_smtp.ts";

/** Recorded, verbatim: the host's name, then eight capabilities. */
const EHLO =
  "250-smtp.hostinger.com\r\n" +
  "250-PIPELINING\r\n" +
  "250-SIZE 48811212\r\n" +
  "250-ETRN\r\n" +
  "250-AUTH PLAIN LOGIN\r\n" +
  "250-ENHANCEDSTATUSCODES\r\n" +
  "250-8BITMIME\r\n" +
  "250-DSN\r\n" +
  "250 CHUNKING\r\n";

test("the greeting is read as one line", () => {
  const lu = lireReponse("220 ESMTP smtp.hostinger.com\r\n", "220");
  assert.equal(lu?.ligne, "220 ESMTP smtp.hostinger.com");
  assert.equal(lu?.reste, "");
});

test("a nine-line EHLO is read to its last line, not its first", () => {
  const lu = lireReponse(EHLO, "250");
  // The last line is the answer. The first is a continuation, and a reader
  // that accepted it would take the host's name for the capability list.
  assert.equal(lu?.ligne, "250 CHUNKING");
  assert.equal(lu?.reste, "");
});

test("a continuation line is never mistaken for the answer", () => {
  // `250 CHUNKING` starts with `250`. A loose match accepts it as soon as it
  // is seen, which is right here — but `250-PIPELINING` must not be taken as
  // the end of the group.
  const lu = lireReponse(EHLO, "250");
  assert.ok(!lu?.ligne.startsWith("250-"), "a continuation was returned as the answer");
});

test("a reply split across two packets is waited for, not misread", () => {
  // The packet boundary falls inside a line, which is where a line-oriented
  // reader that does not wait for the buffer to fill reports a reply it never
  // received.
  const coupe = "250-STARTTLS\r\n250-8BI";
  assert.equal(lireReponse(coupe, "250"), null, "a half-line was read as an answer");

  const lu = lireReponse(coupe + "TMIME\r\n250 CHUNKING\r\n", "250");
  assert.equal(lu?.ligne, "250 CHUNKING");
});

test("what follows the reply is left in the buffer", () => {
  // Two replies can arrive in one packet. The reader takes the first and must
  // not swallow the second, or the exchange is read one step behind.
  const lu = lireReponse("235 2.7.0 Authentication successful\r\n250 2.1.0 Ok\r\n", "235");
  assert.equal(lu?.ligne, "235 2.7.0 Authentication successful");
  assert.equal(lu?.reste, "250 2.1.0 Ok\r\n");
});

test("an authentication challenge is read", () => {
  assert.equal(
    lireReponse("334 VXNlcm5hbWU6\r\n", "334")?.ligne,
    "334 VXNlcm5hbWU6",
  );
});

test("a bare three-digit reply, with no text, is read", () => {
  assert.equal(lireReponse("250\r\n", "250")?.ligne, "250");
});

test("the end of DATA is read", () => {
  assert.equal(
    lireReponse("354 End data with <CR><LF>.<CR><LF>\r\n", "354")?.ligne,
    "354 End data with <CR><LF>.<CR><LF>",
  );
});

test("a refused sender is reported with what the server said", () => {
  // Recorded. This is what the platform sent before the sender address was
  // aligned on the account: the reason was in the reply, and a client that
  // waited for a `250` it would never get would report a timeout instead.
  const refus = "553 5.7.1 <no-reply@x.fr>: Sender address rejected: not owned by user info@y.fr\r\n";
  assert.throws(
    () => lireReponse(refus, "250"),
    /553 5\.7\.1 .*Sender address rejected/,
  );
});

test("a server hanging up is reported, not waited out", () => {
  assert.throws(
    () => lireReponse("421 4.4.2 smtp.hostinger.com Error: timeout exceeded\r\n", "250"),
    /421 4\.4\.2/,
  );
});

test("a goodbye is not a refusal", () => {
  // `221` closes the connection. Reading it as an error would turn a
  // successful send that the server acknowledged and closed into a failure.
  assert.equal(
    lireReponse("221 2.0.0 Bye\r\n", "221")?.ligne,
    "221 2.0.0 Bye",
  );
});

test("a reply to a different question is not silently accepted", () => {
  // The server answered something else. Accepting it would answer a question
  // that was never asked, which is the failure a loose prefix match causes.
  assert.throws(() => lireReponse("535 5.7.8 Authentication credentials invalid\r\n", "250"), /535/);
});

test("an empty buffer waits instead of failing", () => {
  assert.equal(lireReponse("", "250"), null);
});
