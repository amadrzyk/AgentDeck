package dev.agentdeck.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dev.agentdeck.AgentDeckApp
import dev.agentdeck.MainActivity
import dev.agentdeck.R
import dev.agentdeck.net.AgentState
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.net.BridgeEvent
import dev.agentdeck.state.AgentStateHolder
import dev.agentdeck.ui.component.stateLabel

class MonitorService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "dev.agentdeck.STOP_MONITOR"
    }

    private var lastState: AgentState = AgentState.DISCONNECTED

    override fun onCreate() {
        super.onCreate()

        BridgeConnection.instance.onEvent = { event ->
            val stateHolder = AgentStateHolder.instance
            // AgentStateHolder already handles events, just update notification
            if (event is BridgeEvent.State && event.data.state != lastState) {
                lastState = event.data.state
                updateNotification(event.data.state, event.data.projectName)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            BridgeConnection.instance.disconnect()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification(AgentState.DISCONNECTED, null))
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
    }

    private fun updateNotification(state: AgentState, projectName: String?) {
        val notification = buildNotification(state, projectName)
        val manager = getSystemService(android.app.NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun buildNotification(state: AgentState, projectName: String?): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openPending = PendingIntent.getActivity(
            this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, MonitorService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE
        )

        val title = projectName ?: "AgentDeck"
        val text = stateLabel(state)

        return NotificationCompat.Builder(this, AgentDeckApp.CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openPending)
            .addAction(0, "Stop", stopPending)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
