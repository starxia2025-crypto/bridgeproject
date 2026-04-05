IF COL_LENGTH('dbo.SOP_tenants', 'has_returns_access') IS NULL
BEGIN
  ALTER TABLE dbo.SOP_tenants
  ADD has_returns_access BIT NOT NULL
    CONSTRAINT DF_SOP_tenants_has_returns_access DEFAULT 0;
END
GO
