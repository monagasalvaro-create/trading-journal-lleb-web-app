## **Documento de Requerimientos: Motor de Cálculo de Strikes (IBKR)**

### **1\. Objetivo del Programa**

Desarrollar un motor en Python que se conecte a la API de **Interactive Brokers (IBKR)** para obtener datos en tiempo real (o el último cierre) de una acción y calcular niveles de **strikes esperados** basados en la volatilidad implícita (IV) a dos desviaciones estándar.

### **2\. Dependencias y Entorno**

* **Lenguaje:** Python (Compatible con v3.14, incluyendo parches de `asyncio` para Windows).  
* **Librería Principal:** `ib_insync` para la gestión de la conexión y datos.  
* **Librerías de Soporte:** `threading` (para ejecución no bloqueante), `math` (cálculos estadísticos), y `asyncio`.  
* **Configuración de Conexión:**  
  * Host: `127.0.0.1`  
  * Puerto: `7497` (TWS) o `4002` (IB Gateway).  
  * ClientID: Dinámico o fijo (ej. `35`).

### **3\. Flujo de Datos y Lógica de Conexión**

1. **Inicialización de Contrato:** Crear un objeto de tipo `Stock` utilizando el símbolo proporcionado por el usuario, mercado `'SMART'` y moneda `'USD'`.  
2. **Configuración de Datos:**  
   * Establecer `reqMarketDataType(2)` para permitir el uso de datos diferidos si no hay suscripción activa.  
   * Solicitar datos de mercado (`reqMktData`) incluyendo el tick genérico `'106'` (específico para obtener la **Volatilidad Implícita**).  
3. **Ciclo de Captura (Pooling):**  
   * Implementar un sistema de reintentos (mínimo 8 intentos con esperas de 1 segundo) para dar tiempo a que el servidor de IBKR devuelva los ticks.  
   * **Prioridad de Precio:** Obtener el precio actual mediante `marketPrice()`. Si es `NaN` o ≤0, recurrir a `ticker.close` o `ticker.last`.

### **4\. Motor de Cálculo Estadístico**

Una vez obtenidos el **Precio Actual** y la **Volatilidad Implícita Anual (IV)**, el programa debe ejecutar las siguientes fórmulas matemáticas:

* **Volatilidad Diaria (IVd​):**  
   IVdiaria \= IVanual/sqrt(252)  
* **Desviación (D):** (Calculada a 2 desviaciones estándar)  
   Desviacion=Precio×(IVdiaria​×2)  
* **Niveles de Strikes:**  
  * **Strike Call:** Precio+Desviacioˊn  
  * **Strike Put:** Precio−Desviacioˊn

### **5\. Manejo de Errores y Estados**

* **Validación de Entrada:** No procesar si el símbolo está vacío.  
* **Control de Excepciones:** Gestionar errores de conexión (ej. TWS cerrada) mediante bloques `try-except` que retornen mensajes legibles.  
* **Finalización:** Asegurar la desconexión del cliente de IBKR (`ib.disconnect()`) al finalizar cada análisis o al cerrar la aplicación.

