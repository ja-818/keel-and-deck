use super::{now_ms, TunnelClient};
use crate::frame::{PairResponseFrame, PongFrame, TunnelFrame};
use crate::proxy::{close_leg, forward_c2s, proxy_http, proxy_ws_open, EngineEndpoint, LegsMap};

impl TunnelClient {
    pub(super) async fn dispatch(
        &self,
        frame: TunnelFrame,
        out_tx: &tokio::sync::mpsc::UnboundedSender<TunnelFrame>,
        legs: &LegsMap,
        http: &reqwest::Client,
        endpoint: &EngineEndpoint,
    ) {
        match frame {
            TunnelFrame::HttpRequest(req) => {
                let endpoint = endpoint.clone();
                let http = http.clone();
                let tx = out_tx.clone();
                tokio::spawn(async move {
                    let resp = proxy_http(&http, &endpoint, req).await;
                    send_frame(&tx, TunnelFrame::HttpResponse(resp));
                });
            }
            TunnelFrame::WsOpen(open) => {
                let endpoint = endpoint.clone();
                let tx = out_tx.clone();
                let legs = legs.clone();
                tokio::spawn(async move {
                    let ack = proxy_ws_open(&endpoint, open, tx.clone(), legs).await;
                    send_frame(&tx, TunnelFrame::WsOpenAck(ack));
                });
            }
            TunnelFrame::WsMessage(msg) if msg.dir == "c2s" => {
                forward_c2s(legs, msg).await;
            }
            TunnelFrame::WsClose(close) => {
                close_leg(legs, &close.ws_id).await;
            }
            TunnelFrame::PairRequest(pr) => {
                tracing::info!(
                    target: "houston_tunnel",
                    req_id = %pr.req_id,
                    code_len = pr.code.len(),
                    device_label = %pr.device_label,
                    "pair_request received"
                );
                let svc = self.pairing.clone();
                let tx = out_tx.clone();
                tokio::spawn(async move {
                    let resp = match svc.redeem(&pr.code, &pr.device_label).await {
                        Ok(out) => pair_ok(&pr.req_id, out.engine_token),
                        Err(e) => {
                            let code = e.code().to_string();
                            let err_str = e.to_string();
                            tracing::warn!(
                                target: "houston_tunnel",
                                req_id = %pr.req_id,
                                code = %code,
                                error = %err_str,
                                "pair_request rejected"
                            );
                            PairResponseFrame {
                                req_id: pr.req_id,
                                ok: false,
                                engine_token: None,
                                error: Some(err_str),
                                code: Some(code),
                            }
                        }
                    };
                    send_frame(&tx, TunnelFrame::PairResponse(resp));
                });
            }
            TunnelFrame::Ping(ping) => {
                self.send_frame(out_tx, TunnelFrame::Pong(PongFrame { ts: ping.ts }));
            }
            _ => {}
        }
    }

    pub(super) fn send_frame(
        &self,
        tx: &tokio::sync::mpsc::UnboundedSender<TunnelFrame>,
        frame: TunnelFrame,
    ) {
        send_frame(tx, frame);
    }
}

fn pair_ok(req_id: &str, engine_token: String) -> PairResponseFrame {
    tracing::info!(
        target: "houston_tunnel",
        req_id,
        "pair_request ok — minted engine token"
    );
    PairResponseFrame {
        req_id: req_id.to_owned(),
        ok: true,
        engine_token: Some(engine_token),
        error: None,
        code: None,
    }
}

fn send_frame(tx: &tokio::sync::mpsc::UnboundedSender<TunnelFrame>, frame: TunnelFrame) {
    if tx.send(frame).is_err() {
        tracing::debug!(target: "houston_tunnel", now_ms = now_ms(), "outbound frame dropped");
    }
}
