-- Politica de password configurable por el super admin. Tabla singleton
-- (una sola fila, id=1) -- sembrada con los valores que reproducen el
-- comportamiento ACTUAL exacto (minimo 6, sin requisitos de caracteres,
-- pista minima 4, similitud maxima 70) para que aplicar esta migracion
-- no cambie nada hasta que un super admin la endurezca.

create table if not exists politica_password (
    id                                smallint primary key default 1 check (id = 1),
    longitud_minima                   integer not null default 6 check (longitud_minima >= 1),
    requiere_mayuscula                boolean not null default false,
    requiere_minuscula                boolean not null default false,
    requiere_numero                   boolean not null default false,
    requiere_caracter_especial        boolean not null default false,
    pista_longitud_minima             integer not null default 4 check (pista_longitud_minima >= 1),
    pista_similitud_maxima_porcentaje integer not null default 70 check (pista_similitud_maxima_porcentaje between 0 and 100),
    updated_at                        timestamptz not null default now()
);

insert into politica_password (id) values (1) on conflict (id) do nothing;
