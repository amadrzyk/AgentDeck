package dev.agentdeck.ui.eink

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.viewinterop.AndroidView
import dev.agentdeck.terrarium.renderer.EinkRefreshHelper
import kotlinx.coroutines.delay

/**
 * E-ink partial refresh mode — controls how a region is updated on screen.
 */
enum class RefreshMode {
    /** Full GC16 refresh — flash, no ghosting. For terrarium creatures. */
    FULL,
    /** DU (direct update) — fast, slight ghosting. For usage gauges. */
    DU,
    /** A2 (animation mode) — fastest, binary. For state markers, timeline. */
    A2,
}

/**
 * Wraps Compose content in an AndroidView bridge that enables
 * vendor-specific partial refresh control on e-ink displays.
 *
 * When [triggerKey] changes, the zone requests a refresh with the given
 * [mode] after [debounceMs] milliseconds of stability.
 *
 * On non-e-ink devices or unsupported vendors, falls back to standard invalidation.
 */
@Composable
fun EinkRefreshZone(
    mode: RefreshMode,
    debounceMs: Long,
    triggerKey: Any,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    // Keep a snapshot-backed reference to the latest content lambda so
    // the inner ComposeView (created once in AndroidView.factory) always
    // recomposes with the current state instead of the stale capture.
    val currentContent by rememberUpdatedState(content)

    // Track the view reference for vendor API calls
    var viewRef by remember { mutableStateOf<View?>(null) }
    var lastTrigger by remember { mutableLongStateOf(0L) }

    // Debounced refresh on trigger change
    LaunchedEffect(triggerKey) {
        val now = System.currentTimeMillis()
        lastTrigger = now
        delay(debounceMs)

        // Only refresh if no newer trigger arrived during debounce
        if (lastTrigger == now) {
            val view = viewRef
            if (view != null) {
                when (mode) {
                    RefreshMode.FULL -> EinkRefreshHelper.requestFullRefresh(view)
                    RefreshMode.DU -> EinkRefreshHelper.requestDURefresh(view)
                    RefreshMode.A2 -> EinkRefreshHelper.requestA2Refresh(view)
                }
            }
        }
    }

    // Use AndroidView as bridge to get a real View reference
    AndroidView(
        factory = { context ->
            FrameLayout(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                // Force software rendering so EPD controller sees grayscale
                // in the standard framebuffer path (GPU layers may bypass it)
                setLayerType(View.LAYER_TYPE_SOFTWARE, null)
                // Embed Compose content inside this View
                val composeView = ComposeView(context).apply {
                    setContent { currentContent() }
                }
                addView(composeView)
                viewRef = this
            }
        },
        modifier = modifier,
    )
}
