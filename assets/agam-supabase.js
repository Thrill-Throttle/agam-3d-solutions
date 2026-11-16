(() => {
  "use strict";

  const PROJECT_URL = "https://kvterhdqjqhuhnnmlhnk.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_aVXXH8eNSc465Zw97WnSpw_ajrjU5va";
  const SESSION_KEY = "agam-supabase-session-v1";
  const ADMIN_EMAIL = "akileshan2023@gmail.com";
  let session = readSession();

  function readSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error("Could not read the saved Supabase session:", error);
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    try {
      if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error("Could not save the Supabase session:", error);
      throw new Error("Your browser could not save the sign-in session. Check browser storage settings.");
    }
  }

  function headers(accessToken, extra = {}) {
    return {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken || PUBLISHABLE_KEY}`,
      ...extra,
    };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${PROJECT_URL}${path}`, {
      ...options,
      headers: headers(options.accessToken || session?.access_token, options.headers),
    });
    const text = await response.text();
    let result = null;
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Supabase returned an unreadable response (${response.status}).`);
      }
    }
    if (!response.ok) {
      const message = result?.msg || result?.message || result?.error_description || result?.error;
      throw new Error(message || `Supabase request failed (${response.status}).`);
    }
    return result;
  }

  function rememberAuthResult(result) {
    if (!result?.access_token || !result?.refresh_token || !result.user) {
      throw new Error("Supabase did not return a complete sign-in session.");
    }
    const value = {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: result.expires_at || Math.floor(Date.now() / 1000) + Number(result.expires_in || 3600),
    };
    saveSession(value);
    return { session: value, user: result.user };
  }

  function profileFromUser(user) {
    return {
      id: user.id,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "",
      email: user.email || "",
    };
  }

  async function restoreSession() {
    if (!session?.access_token || !session?.refresh_token) {
      saveSession(null);
      return null;
    }

    if (Number(session.expires_at) < Math.floor(Date.now() / 1000) + 60) {
      const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
        accessToken: PUBLISHABLE_KEY,
      });
      rememberAuthResult(refreshed);
    }

    try {
      const user = await request("/auth/v1/user");
      return { session, user: profileFromUser(user) };
    } catch (error) {
      if (/token|session|jwt|auth/i.test(error.message)) {
        saveSession(null);
        return null;
      }
      throw error;
    }
  }

  async function signUp(email, password, name) {
    const result = await request("/auth/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { full_name: name } }),
      accessToken: PUBLISHABLE_KEY,
    });
    if (!result.access_token) return { confirmationRequired: true };
    return rememberAuthResult(result);
  }

  async function signIn(email, password) {
    const result = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      accessToken: PUBLISHABLE_KEY,
    });
    return rememberAuthResult(result);
  }

  async function signInWithGoogleToken(idToken) {
    const result = await request("/auth/v1/token?grant_type=id_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", id_token: idToken }),
      accessToken: PUBLISHABLE_KEY,
    });
    return rememberAuthResult(result);
  }

  async function signOut() {
    try {
      if (session?.access_token) {
        await request("/auth/v1/logout", {
          method: "POST",
          accessToken: session.access_token,
        });
      }
    } finally {
      saveSession(null);
    }
  }

  function mapProduct(row) {
    return {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      category: row.category,
      description: row.description,
      colors: row.colors || [],
      art: row.art || "stand",
      color: row.color || "#258fff",
      image: row.image_url || "",
      facebook: row.facebook || "",
      instagram: row.instagram || "",
    };
  }

  function productToRow(product) {
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      description: product.description,
      colors: product.colors,
      art: product.art,
      color: product.color,
      image_url: product.image || null,
      facebook: product.facebook || null,
      instagram: product.instagram || null,
    };
  }

  function mapOrder(row) {
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      customer: row.customer,
      phone: row.phone,
      address: row.address,
      items: row.items || [],
      total: Number(row.total),
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async function listProducts() {
    const rows = await request("/rest/v1/products?select=*&order=created_at.asc");
    if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid product list.");
    return rows.map(mapProduct);
  }

  async function saveProduct(product) {
    const rows = await request("/rest/v1/products?on_conflict=id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(productToRow(product)),
    });
    if (!Array.isArray(rows) || !rows[0]) throw new Error("Supabase did not save the product.");
    return mapProduct(rows[0]);
  }

  async function deleteProduct(id) {
    await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function listOrders() {
    const rows = await request("/rest/v1/orders?select=*&order=created_at.desc");
    if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid order list.");
    return rows.map(mapOrder);
  }

  async function placeOrder(details, items) {
    const rows = await request("/rest/v1/rpc/place_order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_customer: details.customer,
        p_phone: details.phone,
        p_address: details.address,
        p_items: items.map((item) => ({ id: item.id, color: item.color, quantity: item.quantity })),
      }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.id) throw new Error("Supabase did not confirm the order.");
    return mapOrder(row);
  }

  async function uploadImage(file, bucket, folder) {
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      throw new Error("Choose a valid image file.");
    }
    if (file.size > 2 * 1024 * 1024) throw new Error("Images must be smaller than 2 MB.");
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const uniqueName = `${crypto.randomUUID()}-${safeName}`;
    const objectPath = `${folder}/${uniqueName}`;
    await request(`/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { "Content-Type": file.type, "x-upsert": "false" },
      body: file,
    });
    return `${PROJECT_URL}/storage/v1/object/public/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  }

  async function getPaymentQr() {
    const rows = await request("/rest/v1/site_settings?select=value&id=eq.payment_qr&limit=1");
    if (!Array.isArray(rows)) throw new Error("Supabase returned invalid site settings.");
    return rows[0]?.value || "";
  }

  async function setPaymentQr(value) {
    const rows = await request("/rest/v1/site_settings?on_conflict=id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: "payment_qr", value }),
    });
    if (!Array.isArray(rows) || !rows[0]) throw new Error("Supabase did not save the payment QR setting.");
  }

  async function removeImage(bucket, publicUrl) {
    if (!publicUrl) return;
    const prefix = `${PROJECT_URL}/storage/v1/object/public/${bucket}/`;
    if (!publicUrl.startsWith(prefix)) return;
    const objectPath = publicUrl.slice(prefix.length);
    await request(`/storage/v1/object/${bucket}/${objectPath}`, { method: "DELETE" });
  }

  window.agamSupabase = Object.freeze({
    adminEmail: ADMIN_EMAIL,
    signUp,
    signIn,
    signInWithGoogleToken,
    signOut,
    restoreSession,
    listProducts,
    saveProduct,
    deleteProduct,
    listOrders,
    placeOrder,
    uploadImage,
    getPaymentQr,
    setPaymentQr,
    removeImage,
  });
})();
