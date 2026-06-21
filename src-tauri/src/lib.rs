mod crash;
mod kb;
mod logging;
mod model;
mod policy;
mod provider;
mod secrets;
mod sidecar;
use sidecar::SidecarManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarManager::default())
        .manage(sidecar::GateState::default())
        .manage(provider::ProviderRuntimeState::default())
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
            provider::provider_list_runtime_state,
            provider::provider_create_connection,
            provider::provider_edit_connection,
            provider::provider_disable_connection,
            provider::provider_delete_connection,
            provider::provider_approve_connection,
            provider::provider_check_connection,
            provider::provider_refresh_models,
            provider::provider_stream_chat,
            provider::provider_cancel_stream,
            provider::provider_store_credential,
            provider::provider_clear_credential,
            provider::provider_credential_status,
            model::gemini_model_list,
            model::model_list,
            model::model_stream,
            kb::kb_init,
            kb::kb_stats,
            kb::kb_ingest_text,
            kb::kb_search,
            kb::kb_embedding_status,
            kb::kb_embed_missing,
            kb::kb_semantic_search,
            kb::kb_hybrid_search,
            kb::kb_graphrag_search,
            kb::kb_get_document,
            kb::kb_list_documents,
            kb::kb_delete_document,
            kb::kb_graph_projection,
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
            // Sidecar launch is explicit-only from Agent Sidecar Setup.
            let mgr = app.state::<SidecarManager>();
            mgr.set_log_dir(log_dir);
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
