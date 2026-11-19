// Plugin nativo para la música en segundo plano (Android).
// Dos piezas:
// 1) Reproductor NATIVO (ExoPlayer): el audio sale del WebView para
//    que no se corte al salir de la app ni al apagar la pantalla. El
//    <audio> de la WebView se quedaba sin datos en segundo plano con
//    streams remotos (YouTube): la música local sobrevivía porque ya
//    estaba toda bajada, el stream no. ExoPlayer baja y decodifica en
//    el proceso de la app, con el servicio en primer plano, así que
//    sigue sonando fuera de la app y con la pantalla apagada.
//    playUrl(url, title, artist) es idempotente con la misma URL: si
//    esa canción ya suena, no la reinicia; si está en pausa, reanuda.
//    La cola, los presets y el orden los sigue llevando la web
//    (MusicPlayer): el plugin solo reproduce URLs y avisa con el
//    evento "playerEvent" cuando la canción termina (ended) o falla
//    (error), para que la web avance la cola o caiga al embed.
// 2) Sesión de medios (MediaSessionCompat) + servicio en primer
//    plano AudioForegroundService (notificación MediaStyle con
//    anterior / play-pausa / siguiente). Los botones llegan a la web
//    como evento "mediaControl" (play/pause/next/previous). Sin
//    sesión nativa, la pantalla de bloqueo no muestra controles: el
//    MediaSession de la WebView no genera notificación del sistema
//    (reporte de Luis, build 37). Los botones de auriculares /
//    Bluetooth (onPlay/onPause del callback) mueven el reproductor
//    directo y además avisan a la web para que su estado no se
//    desfase.
// - Uso (ver src/lib/audioService.ts): la web llama a playUrl al
//   sonar (local o YouTube) y a pausePlayer al pausar; el servicio se
//   arranca/para con el reproductor. Nunca se arranca sin música.
// - Registro: MainActivity llama registerPlugin(PulsoAudioPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo, igual
//   que DeviceMusicPlugin y StepCounterPlugin.
// - Sin dependencias más allá de Android + Capacitor + androidx.media
//   (sesión) + androidx.media3 (ExoPlayer).
package com.pulso.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
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

    // Reproductor nativo (una sola instancia para toda la app).
    private static ExoPlayer player;
    private static String currentUrl;

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
            // Botones físicos / Bluetooth: mueven el reproductor
            // directo y avisan a la web para sincronizar su estado.
            @Override public void onPlay() {
                if (player != null && currentUrl != null) {
                    player.play();
                    try { startServiceFor(currentTitle(), currentArtist(), true); } catch (Exception ignored) { /* el audio sigue sin servicio */ }
                }
                onMediaAction("play");
            }
            @Override public void onPause() {
                if (player != null) player.pause();
                onMediaAction("pause");
            }
            @Override public void onSkipToNext() { onMediaAction("next"); }
            @Override public void onSkipToPrevious() { onMediaAction("previous"); }
        });
        mediaSession.setActive(true);
    }

    private void updatePlaybackState(boolean playing) {
        if (mediaSession == null) return;
        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
            .build();
        mediaSession.setPlaybackState(playbackState);
    }

    private void applyMedia(String title, String artist, boolean playing) {
        ensureSession();
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .build();
        mediaSession.setMetadata(metadata);
        updatePlaybackState(playing);
    }

    private void ensurePlayer() {
        if (player != null) return;
        Context ctx = getContext();
        ExoPlayer p = new ExoPlayer.Builder(ctx).build();
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.CONTENT_TYPE_MUSIC)
            .build();
        p.setAudioAttributes(attrs, true);
        p.setHandleAudioBecomingNoisy(true);
        p.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    JSObject data = new JSObject();
                    data.put("type", "ended");
                    notifyListeners("playerEvent", data);
                }
            }
            @Override
            public void onPlayerError(PlaybackException error) {
                JSObject data = new JSObject();
                data.put("type", "error");
                data.put("message", error.getMessage() != null ? error.getMessage() : "error");
                notifyListeners("playerEvent", data);
            }
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                // La sesión y la notificación siguen el estado REAL
                // del reproductor, no solo el estado de la web.
                try {
                    updatePlaybackState(isPlaying);
                    if (serviceStarted) {
                        Intent intent = new Intent(getContext(), AudioForegroundService.class);
                        intent.setAction(AudioForegroundService.ACTION_UPDATE);
                        intent.putExtra(AudioForegroundService.EXTRA_TITLE, currentTitle());
                        intent.putExtra(AudioForegroundService.EXTRA_ARTIST, currentArtist());
                        intent.putExtra(AudioForegroundService.EXTRA_PLAYING, isPlaying);
                        getContext().startService(intent);
                    }
                } catch (Exception ignored) { /* noop */ }
            }
        });
        player = p;
    }

    private void startServiceFor(String title, String artist, boolean playing) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TITLE, title);
        intent.putExtra(AudioForegroundService.EXTRA_ARTIST, artist);
        intent.putExtra(AudioForegroundService.EXTRA_PLAYING, playing);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        serviceStarted = true;
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

    /** Arranca el servicio en primer plano con el título que suena.
        (Compatibilidad: el servicio también se arranca desde playUrl.) */
    @PluginMethod
    public void startAudio(PluginCall call) {
        String title = call.getString("title", "PULSO");
        try {
            applyMedia(title, "PULSO", true);
            startServiceFor(title, "PULSO", true);
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

    /** Reproduce una URL (local content:// o stream https). Idempotente
        con la misma URL: si ya suena, no la reinicia; si está en
        pausa, reanuda (tras terminar, vuelve a empezar). */
    @PluginMethod
    public void playUrl(PluginCall call) {
        String url = call.getString("url", "");
        String title = call.getString("title", "PULSO");
        String artist = call.getString("artist", "PULSO");
        if (url == null || url.isEmpty()) {
            call.reject("Sin URL de audio");
            return;
        }
        try {
            ensurePlayer();
            ensureSession();
            if (url.equals(currentUrl) && player.getPlaybackState() != Player.STATE_IDLE) {
                if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                if (!player.isPlaying()) {
                    player.play();
                    startServiceFor(title, artist, true);
                }
                call.resolve();
                return;
            }
            currentUrl = url;
            player.setMediaItem(MediaItem.fromUri(Uri.parse(url)));
            player.prepare();
            player.play();
            applyMedia(title, artist, true);
            startServiceFor(title, artist, true);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo reproducir: " + e.getMessage());
        }
    }

    /** Pausa el reproductor nativo y para el servicio. */
    @PluginMethod
    public void pausePlayer(PluginCall call) {
        try {
            if (player != null) player.pause();
            try {
                getContext().stopService(new Intent(getContext(), AudioForegroundService.class));
            } catch (Exception ignored) { /* ya estaba parado */ }
            serviceStarted = false;
            applyMedia(currentTitle(), currentArtist(), false);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo pausar: " + e.getMessage());
        }
    }

    /** Adelantar / atrasar (milisegundos). */
    @PluginMethod
    public void seekTo(PluginCall call) {
        int ms = call.getInt("positionMs", 0);
        try {
            if (player != null) player.seekTo(ms);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo adelantar: " + e.getMessage());
        }
    }

    /** Posición actual y duración (para la barrita de minutos). */
    @PluginMethod
    public void getPosition(PluginCall call) {
        JSObject result = new JSObject();
        if (player != null) {
            result.put("positionMs", (int) player.getCurrentPosition());
            long d = player.getDuration();
            result.put("durationMs", d == C.TIME_UNSET ? 0 : (int) d);
            result.put("playing", player.isPlaying());
        } else {
            result.put("positionMs", 0);
            result.put("durationMs", 0);
            result.put("playing", false);
        }
        call.resolve(result);
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
