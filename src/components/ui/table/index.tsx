import type { ReactNode } from "react";

import { cn } from "@/utils";

// Props for Table
interface TableProps {
  children: ReactNode; // Table content (thead, tbody, etc.)
  className?: string; // Optional className for styling
}

// Props for TableHeader
interface TableHeaderProps {
  children: ReactNode; // Header row(s)
  className?: string; // Optional className for styling
}

// Props for TableBody
interface TableBodyProps {
  children: ReactNode; // Body row(s)
  className?: string; // Optional className for styling
}

// Props for TableRow
interface TableRowProps {
  children: ReactNode; // Cells (th or td)
  className?: string; // Optional className for styling
}

// Props for TableCell
interface TableCellProps {
  children?: ReactNode; // Cell content
  isHeader?: boolean; // If true, renders as <th>, otherwise <td>
  className?: string; // Optional className for styling
  /**
   * Libellé de la colonne, affiché à gauche de la cellule quand le tableau
   * bascule en carte sous 640 px.
   *
   * C'est ce qui rend le tableau lisible sur téléphone : sans ce libellé, une
   * ligne empilée n'est plus qu'une suite de valeurs dont on ne sait pas
   * laquelle est le montant et laquelle est la date. La colonne d'en-tête est
   * masquée à ce format, donc le libellé n'apparaît nulle part ailleurs.
   */
  label?: string;
}

// Table Component
const Table: React.FC<TableProps> = ({ children, className }) => {
  return (
    <table className={cn("w-full min-w-full", "table-card", className)}>
      {children}
    </table>
  );
};

// TableHeader Component
const TableHeader: React.FC<TableHeaderProps> = ({ children, className }) => {
  return <thead className={className}>{children}</thead>;
};

// TableBody Component
const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return <tbody className={className}>{children}</tbody>;
};

// TableRow Component
const TableRow: React.FC<TableRowProps> = ({ children, className }) => {
  return <tr className={className}>{children}</tr>;
};

// TableCell Component
const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className,
  label,
}) => {
  const CellTag = isHeader ? "th" : "td";
  return (
    <CellTag className={cn(className)} data-label={label}>
      {/*
        Le contenu est regroupé dans un seul élément. En mode carte, la
        cellule devient une flexbox : sans ce conteneur, une cellule portant une
        valeur et sa sous-légende les répartirait côte à côte au lieu
        d'empiler les deux — et une référence de transaction se retrouverait
        alignée sur la moitié droite avec sa description à côté d'elle.
      */}
      <div className="table-card__value">{children}</div>
    </CellTag>
  );
};

export { Table, TableBody, TableCell, TableHeader, TableRow };
