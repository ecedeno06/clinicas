-- =========================================================
-- Migracion: glucosa_glicosilada en signos_vitales
-- Hemoglobina glicosilada (HbA1c), distinta de la glucosa en
-- sangre (glucosa capilar/venosa puntual) que ya existe. Se
-- expresa en porcentaje, no en mg/dL.
-- =========================================================

alter table signos_vitales
    add column if not exists glucosa_glicosilada numeric(4,1); -- %, ej. 5.7

alter table signos_vitales
    add constraint chk_signos_vitales_glucosa_glicosilada
    check (glucosa_glicosilada is null or (glucosa_glicosilada between 3 and 20));
