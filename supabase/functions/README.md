# Pago online (S3-18)

Configurar secretos sin agregarlos al repositorio:

```bash
supabase secrets set MERCADO_PAGO_ACCESS_TOKEN=... MERCADO_PAGO_WEBHOOK_SECRET=... APP_URL=https://tu-preview.vercel.app PAGO_SIMULADO=false
```

Desplegar la preferencia con JWT y el webhook público (Mercado Pago no envía
un JWT de Supabase):

```bash
supabase functions deploy crear-preferencia-pago
supabase functions deploy webhook-pago --no-verify-jwt
```

Para QA simulada usar `VITE_PAGO_SIMULADO=true` en el frontend y
`PAGO_SIMULADO=true` como secreto de la Edge Function. El endpoint simulado
sí valida la sesión del cliente antes de modificar el pedido.
