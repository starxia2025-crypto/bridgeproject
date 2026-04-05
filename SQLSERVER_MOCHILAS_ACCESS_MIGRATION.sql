IF COL_LENGTH('dbo.SOP_tenants', 'has_mochilas_access') IS NULL
BEGIN
  ALTER TABLE dbo.SOP_tenants
  ADD has_mochilas_access BIT NOT NULL
    CONSTRAINT DF_SOP_tenants_has_mochilas_access DEFAULT 0;
END;
GO
