create policy "tipos_cliente_update"
on public.tipos_cliente
for update
to authenticated
using (
  public.usuario_tiene_permiso('precios.gestionar')
)
with check (
  public.usuario_tiene_permiso('precios.gestionar')
);
