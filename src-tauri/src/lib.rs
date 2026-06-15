mod model;
mod policy;
mod secrets;
mod sidecar;
mod crash;
mod logging;
use sidecar::SidecarManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarManager::default())
        .manage(sidecar::GateState::default())
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_info,
            sidecar::sidecar_restart,
            sidecar::sidecar_send,
            sidecar::sidecar_stream,
            sidecar::set_gates,
            sidecar::sidecar_cancel,
            sidecar::sidecar_tool_result,
            sidecar::sidecar_embed,
            sidecar::sidecar_communities,
            sidecar::sidecar_browser_open,
            sidecar::sidecar_pool_create,
            sidecar::sidecar_pool_release,
            secrets::secret_get,
            secrets::secret_present,
            secrets::secret_set,
            secrets::secret_delete,
            model::model_list,
            model::model_stream,
            sidecar::sidecar_health,
            logging::get_log_dir,
            logging::open_log_dir,
            crash::set_crash_consent,
            crash::get_crash_consent,
            crash::append_js_crash_log,
            crash::get_crash_reports,
            crash::clear_crash_reports,
            crash::open_crash_folder
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // 9.1: init structured logging first; keep guard alive via leak.
            let log_dir = logging::init_logging(&handle);
            crash::init_crash_dir(&handle);
            tracing::info!("CODE NAME starting up");
            // Pass log dir to sidecar so Python writes to the same location.
            let mgr = app.state::<SidecarManager>();
            mgr.set_log_dir(log_dir);
            mgr.start(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building CODE NAME harness")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app_handle.state::<SidecarManager>().shutdown();
            }
        });
}
