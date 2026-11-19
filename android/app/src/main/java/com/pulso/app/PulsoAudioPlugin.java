// Plugin nativo mínimo para la música en segundo plano (Android).
// Arranca/para el servicio en primer plano AudioForegroundService,
// que mantiene vivo el proceso de la app mientras suena la música
// (local o YouTube) para que no se corte al salir de la app o al
// apagar la pantalla. El audio en sí sigue sonando en la WebView;
// el servicio solo evita que Android la duerma.
// - Uso (ver src/lib/audioService.ts): startAudio(title) al empezar
//   a sonar, stopAudio() al pausar. Si cambia la canción mientras
//   suena, se vuelve a llamar a start con el título nuevo y la
//   notificación se actualiza.
// - Además es dueño de la sesión de medios (MediaSessionCompat):
//   updateMedia() pone título/artista/estado y el servicio arma con
//   su token una notificación MediaStyle con play/pausa/anterior/
//   siguiente. Esos botones llegan a la web como evento
//   "mediaControl" (play/pause/next/previous). Sin sesión nativa, la
//   pantalla de bloqueo no muestra controles: el MediaSession de la
//   WebView no genera notificación del sistema (reporte de Luis,
//   build 37: local sonaba apagado pero sin controles).
// - Registro: MainActivity llama registerPlugin(PulsoAudioPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo, igual
//   que DeviceMusicPlugin y StepCounterPlugin.
// - Sin dependencias: solo la API de Android + Capacitor +
//   androidx.media.
package com.pulso.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PulsoAudio")
public class PulsoAudioPlugin extends Plugin {

    // La sesión de medios es estática para que el servicio en primer
    // plano pueda leer su token al armar la notificación MediaStyle.
    private static MediaSessionCompat mediaSession;
    private static PulsoAudioPlugin instance;
    private static boolean serviceStarted = false;

    public static MediaSessionCompat.Token getSessionToken() {
        return mediaSession != null ? mediaSession.getSessionToken() : null;
    }

    public static void setServiceStarted(boolean started) {
        serviceStarted = started;
    }

    /** El servicio reenvía aquí las acciones de la notificación. */
    public static void dispatchMediaAction(String action) {
        if (instance != null) {
            instance.onMediaAction(action);
            return;
        }
        if (mediaSession != null && mediaSession.getController() != null) {
            if ("play".equals(action)) mediaSession.getController().getTransportControls().play();
            else if ("pause".equals(action)) mediaSession.getController().getTransportControls().pause();
            else if ("next".equals(action)) mediaSession.getController().getTransportControls().skipToNext();
            else if ("previous".equals(action)) mediaSession.getController().getTransportControls().skipToPrevious();
        }
    }

    @Override
    public void load() {
        instance = this;
    }

    private void onMediaAction(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("mediaControl", data);
    }

    private void ensureSession() {
        if (mediaSession != null) return;
        Context ctx = getContext();
        mediaSession = new MediaSessionCompat(ctx, "PulsoAudio");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { onMediaAction("play"); }
            @Override public void onPause() { onMediaAction("pause"); }
            @Override public void onSkipToNext() { onMediaAction("next"); }
            @Override public void onSkipToPrevious() { onMediaAction("previous"); }
        });
        mediaSession.setActive(true);
    }

    private void applyMedia(String title, String artist, boolean playing) {
        ensureSession();
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .build();
        mediaSession.setMetadata(metadata);
        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
            .build();
        mediaSession.setPlaybackState(playbackState);
    }

    @PluginMethod
    public void startAudio(PluginCall call) {
        String title = call.getString("title", "PULSO");
        Context ctx = getContext();
        try {
            applyMedia(title, "PULSO", true);
        } catch (Exception ignored) { /* la sesión es opcional: el servicio sigue */ }
        Intent intent = new Intent(ctx, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TITLE, title);
        intent.putExtra(AudioForegroundService.EXTRA_ARTIST, "PULSO");
        intent.putExtra(AudioForegroundService.EXTRA_PLAYING, true);
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
        serviceStarted = true;
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        try {
            // La sesión queda activa en PAUSA con su metadata: así la
            // pantalla de bloqueo sigue ofreciendo reanudar (tarjeta de
            // medios) aunque el servicio ya no esté corriendo.
            applyMedia(currentTitle(), currentArtist(), false);
        } catch (Exception ignored) { /* noop */ }
        try {
            getContext().stopService(new Intent(getContext(), AudioForegroundService.class));
        } catch (Exception ignored) { /* ya estaba parado: no pasa nada */ }
        serviceStarted = false;
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    private String currentTitle() {
        if (mediaSession == null || mediaSession.getController() == null
            || mediaSession.getController().getMetadata() == null) return "PULSO";
        String t = mediaSession.getController().getMetadata().getString(MediaMetadataCompat.METADATA_KEY_TITLE);
        return t != null ? t : "PULSO";
    }

    private String currentArtist() {
        if (mediaSession == null || mediaSession.getController() == null
            || mediaSession.getController().getMetadata() == null) return "PULSO";
        String a = mediaSession.getController().getMetadata().getString(MediaMetadataCompat.METADATA_KEY_ARTIST);
        return a != null ? a : "PULSO";
    }

    /** Actualiza título/artista/estado en la sesión y, si el servicio
        está corriendo, le pide reconstruir la notificación. */
    @PluginMethod
    public void updateMedia(PluginCall call) {
        String title = call.getString("title", "PULSO");
        String artist = call.getString("artist", "PULSO");
        boolean playing = call.getBoolean("playing", false);
        try {
            applyMedia(title, artist, playing);
            if (serviceStarted) {
                Intent intent = new Intent(getContext(), AudioForegroundService.class);
                intent.setAction(AudioForegroundService.ACTION_UPDATE);
                intent.putExtra(AudioForegroundService.EXTRA_TITLE, title);
                intent.putExtra(AudioForegroundService.EXTRA_ARTIST, artist);
                intent.putExtra(AudioForegroundService.EXTRA_PLAYING, playing);
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo actualizar la sesión de medios: " + e.getMessage());
        }
    }
}
