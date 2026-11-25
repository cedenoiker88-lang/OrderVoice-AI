-- OrderVoice AI · Criterio 2 · PostgreSQL local.
-- Solo datos ficticios, sin datos sensibles. Repetible.
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(100) NOT NULL CHECK (length(trim(nombre)) >= 2),
  telefono varchar(30),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS productos (
  id varchar(70) PRIMARY KEY,
  nombre varchar(120) NOT NULL,
  precio_centavos integer NOT NULL CHECK (precio_centavos >= 0),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes(id) ON DELETE RESTRICT,
  estado varchar(15) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'confirmada')),
  creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesion_items (
  sesion_id uuid NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
  producto_id varchar(70) NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad smallint NOT NULL CHECK (cantidad BETWEEN 1 AND 20),
  PRIMARY KEY (sesion_id, producto_id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL UNIQUE REFERENCES sesiones(id),
  cliente_id uuid REFERENCES clientes(id),
  total_centavos integer NOT NULL CHECK (total_centavos >= 0),
  estado varchar(15) NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'cancelado')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_items (
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id varchar(70) NOT NULL REFERENCES productos(id),
  nombre_producto varchar(120) NOT NULL,
  cantidad smallint NOT NULL CHECK (cantidad BETWEEN 1 AND 20),
  precio_unitario_centavos integer NOT NULL CHECK (precio_unitario_centavos >= 0),
  PRIMARY KEY (pedido_id, producto_id)
);

INSERT INTO productos (id, nombre, precio_centavos) VALUES
  ('pepperoni-mediana', 'Pizza pepperoni mediana', 900),
  ('pepperoni-familiar', 'Pizza pepperoni familiar', 1400),
  ('hawaiana-mediana', 'Pizza hawaiana mediana', 1000),
  ('hawaiana-familiar', 'Pizza hawaiana familiar', 1500),
  ('margarita-mediana', 'Pizza margarita mediana', 850),
  ('margarita-familiar', 'Pizza margarita familiar', 1350),
  ('gaseosa', 'Gaseosa 1 litro', 250)
ON CONFLICT (id) DO NOTHING;
