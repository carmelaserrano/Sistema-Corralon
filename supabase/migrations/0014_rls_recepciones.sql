create policy "recepciones_update_authenticated" on public.recepciones
  for update to authenticated
  using (
    usuario_tiene_permiso('compras.recepcion.registrar')
    or usuario_tiene_permiso('compras.recepcion.anular')
  )
  with check (
    usuario_tiene_permiso('compras.recepcion.registrar')
    or usuario_tiene_permiso('compras.recepcion.anular')
  );