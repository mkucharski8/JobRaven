declare module 'sql.js' {
  interface SqlStatement { bind: (params: (string | number | null)[]) => void; step: () => boolean; free: () => void }
  interface SqlDatabase {
    run: (sql: string) => void
    prepare: (sql: string) => SqlStatement
    export: () => Uint8Array
    close: () => void
  }
  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlDatabase
  }
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>
  export default initSqlJs
}
