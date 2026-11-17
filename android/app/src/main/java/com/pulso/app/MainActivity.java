package com.pulso.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// El plugin DeviceMusic (música local del teléfono, MediaStore) y
// PulsoPermissions (actividad física y notificaciones) viven en el
// código de la propia app, no en node_modules, así que `cap sync`
// no los registra solos: hay que registrarlos aquí antes de
// super.onCreate (bridgeBuilder ya existe como campo de BridgeActivity).
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceMusicPlugin.class);
        registerPlugin(PulsoPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
