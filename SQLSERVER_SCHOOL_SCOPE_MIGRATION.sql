ALTER TABLE dbo.SOP_schools
ADD is_headquarters BIT NOT NULL CONSTRAINT DF_SOP_schools_is_headquarters DEFAULT 0;
GO

ALTER TABLE dbo.SOP_users
ADD school_id INT NULL,
    scope_type NVARCHAR(20) NOT NULL CONSTRAINT DF_SOP_users_scope_type DEFAULT 'school';
GO

ALTER TABLE dbo.SOP_users
ADD CONSTRAINT FK_SOP_users_school
FOREIGN KEY (school_id) REFERENCES dbo.SOP_schools(id);
GO

ALTER TABLE dbo.SOP_tickets
ADD school_id INT NULL;
GO

ALTER TABLE dbo.SOP_tickets
ADD CONSTRAINT FK_SOP_tickets_school
FOREIGN KEY (school_id) REFERENCES dbo.SOP_schools(id);
GO

UPDATE dbo.SOP_users
SET scope_type = CASE
  WHEN role IN ('superadmin', 'tecnico') THEN 'global'
  WHEN role IN ('admin_cliente', 'visor_cliente', 'manager', 'usuario_cliente') THEN 'tenant'
  ELSE 'tenant'
END
WHERE scope_type IS NULL OR scope_type = '';
GO

CREATE INDEX IX_SOP_users_tenant_scope ON dbo.SOP_users(tenant_id, scope_type);
GO

CREATE INDEX IX_SOP_users_school_id ON dbo.SOP_users(school_id);
GO

CREATE INDEX IX_SOP_tickets_tenant_school_status ON dbo.SOP_tickets(tenant_id, school_id, status);
GO

CREATE INDEX IX_SOP_schools_tenant_id_active ON dbo.SOP_schools(tenant_id, active);
GO
