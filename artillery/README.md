# Artillery — Pruebas de carga

## Comandos

```powershell
# Correr contra el entorno local (localhost:3000)
npm run test:load -- -e local

# Correr contra el servidor de test (localhost:3001)
npm run test:load -- -e test

# Correr contra producción
npm run test:load -- -e production

# Generar reporte HTML
npm run test:load:report
```

## Estructura

```
artillery/
  base.yml          ← config compartida (target, fases, plugins)
  data/
    users.csv       ← credenciales de usuarios de prueba (rut,password)
  AL-XX-nombre.yml  ← cada caso de prueba va en su propio archivo
```

## Agregar un nuevo caso

1. Crear `artillery/AL-XX-nombre.yml`
2. Importar la config base o definir la propia
3. Correr: `npx artillery run artillery/AL-XX-nombre.yml -e test`
