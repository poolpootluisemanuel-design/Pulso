// Plugin nativo mínimo para el contador de pasos REAL del sistema
// (Android). Por qué un plugin propio y no un paquete npm: no hay un
// plugin de Capacitor mantenido y verificado para Capacitor 8 que
// exponga TYPE_STEP_COUNTER; y es ~130 líneas con cero dependencias.
// - El sensor TYPE_STEP_COUNTER es de hardware: cuenta los pasos desde
//   el último reinicio del teléfono y SIGUE contando con la pantalla
//   apagada (el teléfono encendido, claro; con el móvil apagado nada
//   cuenta, en ninguna app). Por eso es preciso, a diferencia de la
//   estimación por picos de aceleración (DeviceMotion, ~11 m/s²) que
//   usaba GpsTracker antes: esa estimación se pierde al apagar la
//   pantalla y cuenta de más o de menos según cómo se mueva el móvil.
// - Cómo se usa: startCounting() guarda como base el primer valor que
//   llega; getSteps() devuelve (total actual - base), es decir, solo
//   los pasos de ESTA grabación. Al pausar/terminar se llama a
//   stopCounting() y al reanudar se vuelve a empezar con base nueva
//   (GpsTracker suma el offset de lo ya contado). El total del sensor
//   nunca se reinicia desde aquí.
// - Permiso: ACTIVITY_RECOGNITION (Android 10+; antes no existe como
//   permiso en tiempo de ejecución y se considera concedido). El
//   permiso ya estaba declarado en el Manifest y ya se pide en el
//   flujo de permisos de la app; aquí solo se vuelve a pedir si falta.
// - Si el teléfono no tiene este sensor (móviles sin podómetro), el
//   plugin responde available:false y GpsTracker cae a Health Connect
//   (delta de pasos de hoy) y, si tampoco hay, a la estimación por
//   aceleración, con su aviso honesto en pantalla.
// - Registro: MainActivity llama registerPlugin(StepCounterPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo (solo lee
//   los plugins de node_modules), igual que DeviceMusicPlugin.
// - Este plugin NO crea un servicio en primer plano: solo lee el
//   sensor mientras la app está viva. El conteo en sí lo hace el
//   hardware aunque la WebView esté dormida; al volver a primer plano
//   getSteps() lee el total acumulado y el delta sale correcto.
package com.pulso.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "StepCounter",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity")
    }
)
public class StepCounterPlugin extends Plugin {

    private SensorManager sensorManager;
    private Sensor stepSensor;
    /** Total del sensor en el momento de arrancar esta sesión. */
    private float baseline = -1;
    /** Último total recibido del sensor. */
    private float latestTotal = -1;
    private boolean listening = false;

    private final SensorEventListener listener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
            float total = event.values[0];
            if (baseline < 0) baseline = total;
            latestTotal = total;
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {
            // El podómetro no usa la precisión: no hay nada que hacer.
        }
    };

    private SensorManager getSensorManager() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        return sensorManager;
    }

    private Sensor getStepSensor() {
        if (stepSensor == null) {
            SensorManager sm = getSensorManager();
            if (sm != null) stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        }
        return stepSensor;
    }

    private boolean activityGranted() {
        // Antes de Android 10 no existe ACTIVITY_RECOGNITION.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private int stepsSoFar() {
        if (baseline < 0 || latestTotal < 0) return 0;
        return Math.max(0, Math.round(latestTotal - baseline));
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", getStepSensor() != null);
        result.put("granted", activityGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", activityGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (activityGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("activity", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", activityGranted());
        if (getPermissionState("activity") == PermissionState.DENIED) {
            result.put("granted", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void startCounting(PluginCall call) {
        if (!activityGranted()) {
            call.reject("Falta el permiso de Actividad física. Actívalo en Ajustes → PULSO → Permisos → Actividad física.",
                    "PERMISSION_DENIED");
            return;
        }
        if (getStepSensor() == null) {
            call.reject("Este teléfono no tiene contador de pasos del sistema.", "UNAVAILABLE");
            return;
        }
        baseline = -1;
        latestTotal = -1;
        SensorManager sm = getSensorManager();
        if (sm == null) {
            call.reject("No se pudo leer el sensor de pasos.", "UNAVAILABLE");
            return;
        }
        sm.unregisterListener(listener);
        sm.registerListener(listener, stepSensor, SensorManager.SENSOR_DELAY_NORMAL);
        listening = true;
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getSteps(PluginCall call) {
        JSObject result = new JSObject();
        result.put("steps", stepsSoFar());
        result.put("available", getStepSensor() != null);
        result.put("counting", listening);
        call.resolve(result);
    }

    @PluginMethod
    public void stopCounting(PluginCall call) {
        int steps = stepsSoFar();
        SensorManager sm = sensorManager;
        if (sm != null) sm.unregisterListener(listener);
        listening = false;
        JSObject result = new JSObject();
        result.put("steps", steps);
        call.resolve(result);
    }
}
