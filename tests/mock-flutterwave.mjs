// A tiny stand-in for the Flutterwave v3 API, used only by the automated tests.
// It supports hosted payments, a fake checkout page that "pays", and transaction verification.
import http from "node:http";

export function startMockFlutterwave({ port = 9999, secretKey = "FLWSECK_TEST-mock" } = {}) {
  const payments = new Map(); // tx_ref -> { payload }
  const transactions = new Map(); // id -> tx
  let nextId = 7000001;

  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch {
          resolve({});
        }
      });
    });

  function pay(txRef, { amount, currency, status = "successful" } = {}) {
    const p = payments.get(txRef);
    if (!p) return null;
    const id = nextId++;
    const tx = {
      id,
      tx_ref: txRef,
      flw_ref: `MOCK-${id}`,
      amount: amount ?? p.payload.amount,
      charged_amount: amount ?? p.payload.amount,
      app_fee: 1.4,
      amount_settled: (amount ?? p.payload.amount) - 1.4,
      currency: currency ?? p.payload.currency,
      status,
      payment_type: "card",
      created_at: new Date().toISOString(),
      customer: { email: p.payload.customer?.email },
    };
    transactions.set(String(id), tx);
    return tx;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const authed = req.headers.authorization === `Bearer ${secretKey}`;

    if (req.method === "POST" && url.pathname === "/v3/payments") {
      if (!authed) return send(res, 401, { status: "error", message: "Invalid authorization key" });
      const payload = await readBody(req);
      payments.set(payload.tx_ref, { payload });
      return send(res, 200, { status: "success", message: "Hosted Link", data: { link: `http://127.0.0.1:${port}/checkout/${payload.tx_ref}` } });
    }

    const verifyMatch = url.pathname.match(/^\/v3\/transactions\/(\d+)\/verify$/);
    if (req.method === "GET" && verifyMatch) {
      if (!authed) return send(res, 401, { status: "error" });
      const tx = transactions.get(verifyMatch[1]);
      return tx ? send(res, 200, { status: "success", data: tx }) : send(res, 400, { status: "error", message: "No transaction was found for this id" });
    }

    if (req.method === "GET" && url.pathname === "/v3/transactions/verify_by_reference") {
      if (!authed) return send(res, 401, { status: "error" });
      const ref = url.searchParams.get("tx_ref");
      const tx = [...transactions.values()].reverse().find((t) => t.tx_ref === ref);
      return tx ? send(res, 200, { status: "success", data: tx }) : send(res, 400, { status: "error", message: "No transaction was found" });
    }

    // the "checkout page": ?outcome=success|failed|cancelled&amount=
    const checkout = url.pathname.match(/^\/checkout\/(.+)$/);
    if (checkout) {
      const txRef = decodeURIComponent(checkout[1]);
      const p = payments.get(txRef);
      if (!p) return send(res, 404, { error: "unknown" });
      const outcome = url.searchParams.get("outcome") || "success";
      const back = new URL(p.payload.redirect_url);
      back.searchParams.set("tx_ref", txRef);
      if (outcome === "cancelled") {
        back.searchParams.set("status", "cancelled");
      } else {
        const tx = pay(txRef, { amount: url.searchParams.has("amount") ? Number(url.searchParams.get("amount")) : undefined, status: outcome === "failed" ? "failed" : "successful" });
        back.searchParams.set("status", outcome === "failed" ? "failed" : "successful");
        back.searchParams.set("transaction_id", String(tx.id));
      }
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    send(res, 404, { status: "error", message: "not found" });
  });

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        server,
        payments,
        transactions,
        pay,
        close: () => new Promise((r) => server.close(r)),
      })
    )
  );
}
