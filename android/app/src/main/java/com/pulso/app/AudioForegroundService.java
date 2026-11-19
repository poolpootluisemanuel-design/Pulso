// Servicio en primer plano para la música (Android).
// Por qué hace falta: el audio de PULSO suena dentro de la WebView y
// Android pausa la WebView cuando la app pasa a segundo plano o se
// apaga la pantalla. Con este servicio en primer plano (tipo
// "mediaPlayback", con su notificación), el proceso de la app queda
// en primer plano y el audio sigue sonando al salir de la app o con
// la pantalla apagada, como hacen las apps de música.
// - El servicio NO reproduce nada por sí mismo: solo mantiene vivo
//   el proceso mientras el <audio> local o el reproductor de YouTube
//   suenan en la WebView. Al pausar la música se para el servicio.
// - Se arranca SOLO desde un gesto del usuario (tocar Reproducir),
//   así que no choca con la restricción de Android 14 de arrancar
//   servicios en primer plano desde segundo plano.
// - La notificación es MediaStyle con el token de la sesión de medios
//   de PulsoAudioPlugin: muestra título, artista y los botones
//   anterior / play-pausa / siguiente en la pantalla de bloqueo y en
//   los ajustes rápidos. Antes era una notificación plana sin
//   acciones y el teléfono no mostraba controles (reporte de Luis,
//   build 37). El canal es IMPORTANCE_DEFAULT para que la tarjeta de
//   medios se vea en bloqueo (antes era LOW).
// - Registro: el plugin PulsoAudioPlugin lo arranca/para; el servicio
//   se declara en AndroidManifest.xml (foregroundServiceType
//   "mediaPlayback") y usa los permisos FOREGROUND_SERVICE y
//   FOREGROUND_SERVICE_MEDIA_PLAYBACK (normales, sin diálogo).
package com.pulso.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.session.MediaSessionCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class AudioForegroundService extends Service {
    public static final String CHANNEL_ID = "pulso_audio";
    public static final int NOTIF_ID = 2;
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_PLAYING = "playing";

    public static final String ACTION_UPDATE = "com.pulso.app.UPDATE";
    public static final String ACTION_PLAY = "com.pulso.app.PLAY";
    public static final String ACTION_PAUSE = "com.pulso.app.PAUSE";
    public static final String ACTION_NEXT = "com.pulso.app.NEXT";
    public static final String ACTION_PREVIOUS = "com.pulso.app.PREVIOUS";

    private String currentTitle = "PULSO";
    private String currentArtist = "PULSO";
    private boolean currentPlaying = true;

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
            NotificationManager.IMPORTANCE_DEFAULT
        );
        ch.setDescription("Controles de la música en la pantalla de bloqueo y notificaciones.");
        nm.createNotificationChannel(ch);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_PLAY.equals(action) || ACTION_PAUSE.equals(action)
                || ACTION_NEXT.equals(action) || ACTION_PREVIOUS.equals(action)) {
            String control = ACTION_PLAY.equals(action) ? "play"
                : ACTION_PAUSE.equals(action) ? "pause"
                : ACTION_NEXT.equals(action) ? "next" : "previous";
            PulsoAudioPlugin.dispatchMediaAction(control);
            // La app actualiza el estado y reconstruye la notificación
            // con updateMedia; aquí no se toca nada más.
            return START_NOT_STICKY;
        }
        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) currentTitle = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_ARTIST)) currentArtist = intent.getStringExtra(EXTRA_ARTIST);
            if (intent.hasExtra(EXTRA_PLAYING)) currentPlaying = intent.getBooleanExtra(EXTRA_PLAYING, true);
        }
        Notification notif = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, notif);
        }
        // Si Android mata el servicio, NO lo reinicia solo: sin música
        // no hay nada que mantener vivo (evita una notificación huérfana).
        return START_NOT_STICKY;
    }

    private PendingIntent actionIntent(String action, int code) {
        Intent intent = new Intent(this, AudioForegroundService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, code, intent, flags);
    }

    private Notification buildNotification() {
        MediaSessionCompat.Token token = PulsoAudioPlugin.getSessionToken();
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(new NotificationCompat.Action(
                android.R.drawable.ic_media_previous, "Anterior", actionIntent(ACTION_PREVIOUS, 1)))
            .addAction(new NotificationCompat.Action(
                currentPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                currentPlaying ? "Pausa" : "Reproducir",
                actionIntent(currentPlaying ? ACTION_PAUSE : ACTION_PLAY, 2)))
            .addAction(new NotificationCompat.Action(
                android.R.drawable.ic_media_next, "Siguiente", actionIntent(ACTION_NEXT, 3)));
        if (token != null) {
            b.setStyle(new MediaStyle().setMediaSession(token).setShowActionsInCompactView(0, 1, 2));
        }
        return b.build();
    }

    @Override
    public void onDestroy() {
        PulsoAudioPlugin.setServiceStarted(false);
        try { stopForeground(true); } catch (Exception ignored) { /* noop */ }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
