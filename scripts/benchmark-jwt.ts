/**
 * AP-02 | Latencia de verificación JWT
 *
 * Ejecuta verifyToken() 1000 veces en lotes de 100 y mide
 * el tiempo promedio por verificación para detectar degradación acumulativa.
 *
 * Criterios: promedio < 2ms por verificación; sin degradación entre lotes.
 *
 * Uso: npx ts-node --project tsconfig.test.json scripts/benchmark-jwt.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import { generateToken, verifyToken } from "../lib/auth";

const TOTAL  = 1000;
const BATCH  = 100;
const MAX_AVG_MS    = 2;      // criterio: promedio < 2 ms
const MAX_DRIFT_PCT = 20;     // degradación máxima aceptable entre primer y último lote: 20%

console.log(`\n═══════════════════════════════════════════`);
console.log(` AP-02 | Benchmark verifyToken() × ${TOTAL}`);
console.log(`═══════════════════════════════════════════\n`);

// Generar 1000 tokens válidos
process.stdout.write("Generando tokens...");
const tokens = Array.from({ length: TOTAL }, (_, i) =>
  generateToken(`bench-user-${i}`, "player")
);
console.log(" hecho.\n");

const batchTimes: number[] = [];
let totalErrors = 0;

for (let b = 0; b < TOTAL / BATCH; b++) {
  const slice = tokens.slice(b * BATCH, (b + 1) * BATCH);
  const start = performance.now();

  let errors = 0;
  for (const token of slice) {
    try {
      verifyToken(token);
    } catch {
      errors++;
    }
  }

  const elapsed   = performance.now() - start;
  const avgPerOp  = elapsed / BATCH;
  batchTimes.push(avgPerOp);
  totalErrors += errors;

  console.log(
    `Lote ${String(b + 1).padStart(2)}  ` +
    `avg: ${avgPerOp.toFixed(3).padStart(7)} ms/op  ` +
    `total lote: ${elapsed.toFixed(2).padStart(8)} ms  ` +
    `errores: ${errors}`
  );
}

// ── Resultados finales ────────────────────────────────────────────────────
const globalAvg  = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
const firstBatch = batchTimes[0];
const lastBatch  = batchTimes[batchTimes.length - 1];
const drift      = ((lastBatch - firstBatch) / firstBatch) * 100;

console.log("\n───────────────────────────────────────────");
console.log(` Promedio global : ${globalAvg.toFixed(3)} ms/op`);
console.log(` Primer lote     : ${firstBatch.toFixed(3)} ms/op`);
console.log(` Último lote     : ${lastBatch.toFixed(3)} ms/op`);
console.log(` Degradación     : ${drift.toFixed(1)}%`);
console.log(` Errores totales : ${totalErrors}`);
console.log("───────────────────────────────────────────\n");

// ── Validación de criterios ───────────────────────────────────────────────
let passed = true;

if (globalAvg >= MAX_AVG_MS) {
  console.error(`✗ FAIL: promedio ${globalAvg.toFixed(3)} ms >= límite ${MAX_AVG_MS} ms`);
  passed = false;
} else {
  console.log(`✓ PASS: promedio ${globalAvg.toFixed(3)} ms < ${MAX_AVG_MS} ms`);
}

if (drift > MAX_DRIFT_PCT) {
  console.error(`✗ FAIL: degradación ${drift.toFixed(1)}% > límite ${MAX_DRIFT_PCT}%`);
  passed = false;
} else {
  console.log(`✓ PASS: degradación ${drift.toFixed(1)}% ≤ ${MAX_DRIFT_PCT}%`);
}

if (totalErrors > 0) {
  console.error(`✗ FAIL: ${totalErrors} errores de verificación`);
  passed = false;
} else {
  console.log(`✓ PASS: 0 errores de verificación`);
}

console.log();
process.exit(passed ? 0 : 1);
