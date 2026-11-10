package br.com.pontotela.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder

/**
 * Desligar pelo controle so poe a TV em standby: nao ha reboot, entao o BootReceiver
 * nao dispara. Este servico fica vivo (foreground) e reabre o player quando a tela acende.
 * SCREEN_ON so pode ser escutado por receiver registrado em codigo, por isso o servico.
 *
 * Abrir activity a partir do segundo plano exige (Android 10+) a permissao
 * "Sobrepor a outros apps" -- pedida pela MainActivity.
 */
class WakeService : Service() {
    private val screenOn = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = openPlayer(context)
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, notification())
        registerReceiver(screenOn, IntentFilter(Intent.ACTION_SCREEN_ON))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

    override fun onDestroy() {
        unregisterReceiver(screenOn)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @Suppress("DEPRECATION")
    private fun notification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, "Player", NotificationManager.IMPORTANCE_MIN)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            Notification.Builder(this, CHANNEL)
        } else {
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Ponto Tela")
            .setContentText("Reabre o player quando a TV liga")
            .build()
    }

    companion object {
        private const val CHANNEL = "player"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            val intent = Intent(context, WakeService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun openPlayer(context: Context) {
            context.startActivity(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
