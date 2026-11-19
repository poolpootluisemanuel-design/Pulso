// Servicio en primer plano para la música (Android).
// Por qué hace falta: el audio de PULSO suena dentro de la WebView y
// Android pausa la WebView cuando la app pasa a segundo plano o se
// apaga la pantalla. Con este servicio en primer plano (tipo
// "mediaPlayback", con su notificación "PULSO · Sonando"), el proceso
// de la app queda en primer plano y el audio sigue sonando al salir
// de la app o con la pantalla apagada, como hacen las apps de música.
// - El servicio NO reproduce nada por sí mismo: solo mantiene vivo
//   el proceso mientras el <audio> local o el reproductor de YouTube
//   suenan en la WebView. Al pausar la música se para el servicio.
// - Se arranca SOLO desde un gesto del usuario (tocar Reproducir),
//   así que no choca con la restricción de Android 14 de arrancar
//   servicios en primer plano desde segundo plano.
// - La notificación del servicio se muestra siempre (los servicios
//   en primer plano están exentos del permiso POST_NOTIFICATIONS).
// - Registro: el plugin PulsoAudioPlugin lo arranca/para; el servicio
//   se declara en AndroidManifest.xml (foregroundServiceType
//   "mediaPlayback") y usa los permisos FOREGROUND_SERVICE y
//   FOREGROUND_SERVICE_MEDIA_PLAYBACK (normales, sin diálogo).
package com.pulso.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class AudioForegroundService extends Service {
    public static final String CHANNEL_ID = "pulso_audio";
    public static final int NOTIF_ID = 2;
    public static final String EXTRA_TITLE = "title";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID,
            "Música de PULSO",
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Mantiene la música sonando al salir de la app o con la pantalla apagada.");
        nm.createNotificationChannel(ch);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        if (title == null || title.isEmpty()) title = "PULSO";
        createChannel();
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PULSO · Sonando")
            .setContentText(title)
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, notif);
        }
        // Si Android mata el servicio, NO lo reinicia solo: sin música
        // no hay nada que mantener vivo (evita una notificación huérfana).
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try { stopForeground(true); } catch (Exception ignored) { /* noop */ }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
