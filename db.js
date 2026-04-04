import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/* =============================
   客戶
============================= */

export async function saveCustomer(data = {}) {
  const payload = {
    platform_id: data.platform_id || "",
    message: data.message || "",
    status: data.status || "new",
    followup_stage: data.followup_stage || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: result, error } = await supabase
    .from("customers")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function getCustomer(platformId = "") {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("platform_id", platformId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* =============================
   付款連結
============================= */

export async function getPaymentLink(plan = "growth") {
  const envMap = {
    starter: process.env.PLATFORM_STARTER_LINK,
    growth: process.env.PLATFORM_GROWTH_LINK,
    elite: process.env.PLATFORM_ELITE_LINK
  };

  if (envMap[plan]) return envMap[plan];

  const { data, error } = await supabase
    .from("payment_links")
    .select("url")
    .eq("plan", plan)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.url || envMap.growth || "";
}

/* =============================
   訂單
============================= */

export async function createOrder(payload = {}) {
  const orderData = {
    platform_id: payload.platform_id || "",
    plan: payload.plan || "growth",
    amount: payload.amount || null,
    stripe_session_id: payload.stripe_session_id || null,
    status: payload.status || "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("orders")
    .insert([orderData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markOrderPaid(stripeSessionId = "") {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      updated_at: new Date().toISOString()
    })
    .eq("stripe_session_id", stripeSessionId)
    .select();

  if (error) throw error;
  return data;
}

/* =============================
   追單
============================= */

export async function getFollowUpCustomers3Min() {
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .lte("created_at", threeMinAgo)
    .is("followup_stage", null);

  if (error) throw error;
  return data || [];
}

export async function getFollowUpCustomers1Day() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .lte("created_at", oneDayAgo)
    .eq("followup_stage", "3min");

  if (error) throw error;
  return data || [];
}

export async function updateFollowUp(id, stage = "") {
  const { data, error } = await supabase
    .from("customers")
    .update({
      followup_stage: stage,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select();

  if (error) throw error;
  return data;
}
