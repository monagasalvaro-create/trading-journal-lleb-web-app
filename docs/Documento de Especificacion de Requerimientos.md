# **Especificación de Requerimientos de Software (SRS) v2.0**

**Proyecto:** My Trading Journal – Pro Edition

## **1\. Introducción**

### **1.1 Propósito**

Este documento redefine los requerimientos para "My Trading Journal", evolucionando de un script de análisis a una **Plataforma Web de Alto Rendimiento**. El objetivo es proveer una interfaz gráfica de usuario (GUI) premium, con animaciones fluidas, tiempos de carga instantáneos y visualizaciones financieras de nivel institucional.

### **1.2 Alcance**

El sistema funcionará como una aplicación local completa (Full Stack) que ingesta datos de IBKR, permite la auditoría psicológica de operaciones mediante una interfaz moderna y presenta un Dashboard de control financiero con capacidades de "What-If Analysis" (simulación de escenarios).

### **1.3 Stack Tecnológico (Actualizado para Alto Impacto Visual)**

Para cumplir con el requisito de "Muy Visual" y "Mejor Programa Posible":

* **Frontend (Interfaz):**  
  * **Framework:** React.js (vía Vite o Next.js) con TypeScript.  
  * **Estilos & UI:** **Tailwind CSS** \+ **Shadcn/ui** (para componentes minimalistas y elegantes).  
  * **Visualización:** **Recharts** (para gráficos generales) y **TradingView Lightweight Charts** (específico para series temporales financieras de alta precisión).  
* **Backend (Lógica):**  
  * **API:** Python 3.10+ con **FastAPI** (Extremadamente rápido y asíncrono).  
  * **Procesamiento:** Pandas & NumPy.  
* **Persistencia (Base de Datos):**  
  * **Motor:** **SQLite** (con SQLAlchemy o Prisma). *Justificación: El CSV es propenso a corrupción de datos; SQLite es un archivo único, robusto y permite consultas complejas rápidas.*

---

## **2\. Descripción General del Sistema**

La aplicación adoptará una arquitectura **Cliente-Servidor**.

1. **Backend (Python):** Se encarga del trabajo pesado (ETL de IBKR, cálculos matemáticos complejos, gestión de base de datos).  
2. **Frontend (React):** Se encarga de la experiencia visual. No recarga la página completa al filtrar (SPA), sino que anima los cambios en los gráficos suavemente.

---

## **3\. Requerimientos Funcionales**

### **Módulo A: Gestión de Datos y Backend (FastAPI)**

#### **RF-001: Integración Robusta con IBKR Flex Service**

* El sistema dispondrá de un endpoint `/api/sync` que recibe el Token y Query ID.  
* Se implementará un mecanismo de **"Retry Logic"**: Si la API de IBKR falla (algo común), el sistema reintentará 3 veces con espera exponencial antes de reportar error.  
* Los datos XML recibidos se parsean a DataFrame, se limpian y se insertan en la base de datos SQLite (upsert: actualizar si existe, insertar si es nuevo).

#### **RF-002: Base de Datos Relacional**

* Migración de CSV a tabla SQL `Trades`.  
* Campos obligatorios: `id` (único, generado por hash de fecha+ticker+orden), `ticker`, `fecha_entrada`, `fecha_salida`, `commissions`, `net_pnl`, `strategy`, `psychology_tag`.

#### **RF-003: Motor de Cálculo Financiero**

* El backend expondrá endpoints para métricas pre-calculadas para no sobrecargar al navegador:  
  * `gross_pnl`: `net_pnl` \+ `commissions` (Asegurando la normalización de signos negativos).  
  * `adjusted_pnl`: Cálculo dinámico que excluye trades marcados como errores.

#### **RF-004: Auditoría de Trades (Data Enrichment)**

* **Interfaz de Grilla Interactiva (AG Grid o TanStack Table):**  
  * El usuario visualizará sus trades en una tabla avanzada con ordenamiento y filtrado instantáneo.  
* **Edición Inline:**  
  * Al hacer doble clic en la celda "Tag Error", aparecerá un menú flotante (Popover) para seleccionar: *FOMO, Revenge Trading, Salida Prematura, Violación de Reglas*.  
  * **Feedback Visual:** La fila del trade cambiará sutilmente de color (ej. rojo pálido) si se etiqueta como un error negativo.  
  * La actualización se guarda automáticamente en la BD (Auto-save) con una notificación "Toast" de éxito.

---

### **Módulo B: Dashboard y Experiencia Visual (React)**

#### **RF-005: Panel de Control "Bento Grid"**

* El diseño no será una lista vertical, sino un **Grid Modular** (estilo Bento) responsivo y estético.  
* **Modo Oscuro/Claro:** El sistema detectará la preferencia del sistema operativo y aplicará un tema visual acorde (Dark Mode optimizado para traders).

#### **RF-006: Filtros Reactivos y "Magic Toggle"**

* **Sidebar Colapsable:** Menú lateral elegante con iconos vectoriales.  
* **Switch "Simular Disciplina Perfecta":**  
  * Este es el reemplazo visual del "Checkbox Mágico".  
  * Al activarlo, **no** se recarga la página. Una animación suave transiciona los números y gráficos desde su estado actual al estado "sin errores". El usuario ve literalmente cómo su curva de capital "crece" visualmente al eliminar sus errores.

#### **RF-007: Tarjetas de Métricas (KPI Cards)**

* Diseño "Glassmorphism" (efecto vidrio esmerilado).  
* Indicadores con "Delta":  
  * Ejemplo: Net P\&L: **$5,200** (y en pequeño: *\+$200 vs mes anterior*).  
* **Visualización de Profit Factor:** Un medidor tipo "Gauge" semicircular. Si es \> 2.0 se ilumina en verde neón; \< 1.0 en rojo.

#### **RF-008: Curva de Equidad Comparativa (The Money Shot)**

* **Tecnología:** TradingView Lightweight Charts (Librería Canvas de alto rendimiento).  
* **Dual Line:**  
  * Línea A (Sólida): Real P\&L.  
  * Línea B (Punteada/Glow): P\&L Potencial (Sin errores).  
* **Interacción:** Al pasar el mouse (hover), muestra un tooltip sincronizado con los detalles exactos del día y la diferencia monetaria entre la realidad y el potencial.

#### **RF-009: Calendario de Calor (Heatmap)**

* Implementación similar a las contribuciones de GitHub, pero financiera.  
* Celdas interactivas: Al hacer clic en un día del calendario, se abre un modal lateral (Drawer) mostrando los trades específicos de ese día.

---

## **4\. Requerimientos No Funcionales (Calidad)**

### **RNF-001: Performance UI**

* La interfaz debe mantener 60 FPS (cuadros por segundo) durante las animaciones de gráficos.  
* El tiempo de renderizado inicial del Dashboard debe ser menor a 1 segundo asumiendo una base de datos de hasta 10,000 trades.

### **RNF-002: Manejo de Estados (State Management)**

* Uso de **React Query (TanStack Query)** para manejar el caché de datos en el frontend. Esto asegura que si el usuario navega entre pestañas, los datos no se vuelvan a pedir al servidor innecesariamente, dando una sensación de "instantaneidad".

### **RNF-003: Instalación y Portabilidad**

* El proyecto debe incluir un `docker-compose.yml`. Esto permite que el usuario lance "el mejor programa posible" con un solo comando (`docker-compose up`), levantando tanto el Backend Python como el Frontend React y la base de datos sin configurar entornos manuales.

