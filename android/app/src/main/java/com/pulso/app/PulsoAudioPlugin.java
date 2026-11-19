// Plugin nativo mínimo para la música en segundo plano (Android).
// Arranca/para el servicio en primer plano AudioForegroundService,
// que mantiene vivo el proceso de la app mientras suena la música
// (local o YouTube) para que no se corte al salir de la app o al
// apagar la pantalla. El audio en sí sigue sonando en la WebView;
// el servicio solo evita que Android la duerma.
// - Uso (ver src/lib/audioService.ts): startAudio(title) al empezar
//   a sonar, stopAudio() al pausar. Si cambia la canción mientras
//   suena, se vuelve a llamar a startAudio con el título nuevo y la
//   notificación se actualiza.
// - Registro: MainActivity llama registerPlugin(PulsoAudioPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo, igual
//   que DeviceMusicPlugin y StepCounterPlugin.
// - Sin dependencias: solo la API de Android + Capacitor.
package com.pulso.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PulsoAudio")
public class PulsoAudioPlugin extends Plugin {

    @PluginMethod
    public void startAudio(PluginCall call) {
        String title = call.getString("title", "PULSO");
        Context ctx = getContext();
        Intent intent = new Intent(ctx, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TITLE, title);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            call.reject("No se pudo arrancar el servicio de audio en primer plano: " + e.getMessage(), "START_FAILED");
            return;
        }
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), AudioForegroundService.class));
        } catch (Exception ignored) { /* ya estaba parado: no pasa nada */ }
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
