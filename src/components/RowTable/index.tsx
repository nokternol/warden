import styles from './RowTable.module.css';

export { styles as rowTableStyles };

export interface RowTableColumn {
  label: string;
  /** A fixed width where the content should not set it, e.g. `w-[140px]`. */
  className?: string;
}

/** A table of records, with the rows of `children` under one heading per column. */
export default function RowTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: readonly RowTableColumn[];
  children: React.ReactNode;
}) {
  return (
    <table className={styles.table} aria-label={label}>
      <thead className={styles.head}>
        <tr className={styles.headRow}>
          {columns.map((column) => (
            <th key={column.label} className={`${styles.columnHeader} ${column.className ?? ''}`}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
