import { drizzle } from "drizzle-orm/node-mssql";
import mssql from "mssql";
import * as schema from "./schema";
import { getMochilasSqlServerConfig, getSqlServerConfig } from "./sqlserver-env";

const sqlServerConfig = getSqlServerConfig();

export const pool = new mssql.ConnectionPool(sqlServerConfig);
export const poolConnect = pool.connect();
export const db = drizzle({ connection: sqlServerConfig, schema });

export function createSqlServerPool(databaseOverride?: string) {
  return new mssql.ConnectionPool(databaseOverride ? getSqlServerConfig(databaseOverride) : getSqlServerConfig());
}

export function createMochilasSqlServerPool() {
  return new mssql.ConnectionPool(getMochilasSqlServerConfig());
}

export * from "./schema";
