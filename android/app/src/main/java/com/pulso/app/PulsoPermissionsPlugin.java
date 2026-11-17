// Plugin nativo mínimo para los permisos que ningún plugin de
// Capacitor instalado cubre (Android).
// - Actividad física (ACTIVITY_RECOGNITION): para contar pasos con el
//   sensor mientras se graba. El permiso ya estaba declarado en el
//   Manifest, pero nadie lo pedía en tiempo de ejecución.
// - Notificaciones (POST_NOTIFICATIONS, Android 13+): para avisar de
//   sesiones y retos. En Android 12 o menos no existe este permiso en
//   tiempo de ejecución y se considera concedido.
// Por qué un plugin propio y no un paquete npm: solo son dos permisos
//   (check + request), ~90 líneas, cero dependencias nuevas; instalar
//   @capacitor/local-notifications solo para pedir POST_NOTIFICATIONS
//   añadiría un servicio de notificaciones que PULSO aún no usa.
// - checkAll(): estado actual de ambos sin mostrar ningún diálogo.
// - requestActivity() / requestNotifications(): muestran el diálogo
//   del sistema una vez y resuelven {granted}. Si el usuario ya lo
//   negó dos veces, Android ya no muestra el diálogo y devuelve false:
//   en ese caso la app ofrece "Ir a Ajustes" (openSettings()).
// - openSettings(): abre la pantalla de Ajustes de PULSO, donde se
//   cambian todos los permisos (también sirve para la ubicación
//   "Permitir todo el tiempo", que Android NO permite pedir con un
//   diálogo: solo se concede desde Ajustes).
// - Registro: MainActivity llama registerPlugin(PulsoPermissionsPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo (solo lee
//   los plugins de node_modules).
package com.pulso.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PulsoPermissions",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity")
    }
)
public class PulsoPermissionsPlugin extends Plugin {

    private boolean notificationsGranted() {
        // Antes de Android 13 no hay permiso en tiempo de ejecución
        // para notificaciones: la app ya puede avisar.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean activityGranted() {
        // Antes de Android 10 no existe ACTIVITY_RECOGNITION.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkAll(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", notificationsGranted());
        result.put("activity", activityGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (notificationsGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestActivity(PluginCall call) {
        if (activityGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("activity", call, "activityResult");
    }

    @PermissionCallback
    private void activityResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", activityGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
