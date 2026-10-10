package com.agentfinder.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;

/**
 * The phone's own "Turn on location?" dialog. The web page cannot show it: a browser can only
 * ask permission, not switch the phone's location on. This plugin asks Google Play services to
 * raise the system dialog; where Play services are missing it opens the Location settings
 * page instead, so there is always a way to put location on without leaving the flow.
 */
@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> resolutionLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        resolutionLauncher = getBridge()
            .registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onResolved);
    }

    /** Whether location is switched on, and whether this app may read it. */
    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusOf(getContext()));
    }

    /** Show the system dialog. Resolves {enabled: true} once location is on. */
    @PluginMethod
    public void turnOn(PluginCall call) {
        Context context = getContext();
        if (isEnabled(context)) {
            call.resolve(statusOf(context));
            return;
        }
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10_000L).build();
        LocationSettingsRequest settings = new LocationSettingsRequest.Builder().addLocationRequest(request).setAlwaysShow(true).build();
        LocationServices
            .getSettingsClient(getActivity())
            .checkLocationSettings(settings)
            .addOnSuccessListener(response -> call.resolve(statusOf(context)))
            .addOnFailureListener(e -> {
                if (e instanceof ResolvableApiException && resolutionLauncher != null) {
                    pendingCall = call;
                    try {
                        IntentSenderRequest req = new IntentSenderRequest.Builder(((ResolvableApiException) e).getResolution()).build();
                        resolutionLauncher.launch(req);
                    } catch (Exception launchError) {
                        pendingCall = null;
                        openSettings(call);
                    }
                } else {
                    openSettings(call);
                }
            });
    }

    private void onResolved(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        JSObject out = statusOf(getContext());
        out.put("accepted", result.getResultCode() == Activity.RESULT_OK);
        call.resolve(out);
    }

    /** No Play services: the settings page is the next best thing. The web side asks again on return. */
    private void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = statusOf(getContext());
            out.put("openedSettings", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not open the phone's location settings.");
        }
    }

    private static boolean isEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        return manager != null && LocationManagerCompat.isLocationEnabled(manager);
    }

    private static JSObject statusOf(Context context) {
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        JSObject out = new JSObject();
        out.put("enabled", isEnabled(context));
        out.put("permission", fine || coarse ? "granted" : "prompt");
        return out;
    }
}
