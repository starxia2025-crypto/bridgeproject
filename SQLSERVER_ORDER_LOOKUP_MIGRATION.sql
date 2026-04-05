IF COL_LENGTH('dbo.SOP_tenants', 'has_order_lookup') IS NULL
BEGIN
  ALTER TABLE dbo.SOP_tenants
  ADD has_order_lookup BIT NOT NULL
    CONSTRAINT DF_SOP_tenants_has_order_lookup DEFAULT 0;
END
GO
