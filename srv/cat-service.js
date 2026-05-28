
const cds = require("@sap/cds");
const { OrchestrationClient } = require("@sap-ai-sdk/orchestration");

module.exports = cds.service.impl(async function () {
  const { Products, Vendors } = this.entities;

  // Unbound action handler for countEntities
  this.on("countEntities", async (req) => {
    const [vendorCount, productCount] = await Promise.all([
      SELECT.from(Vendors).columns("count(1) as count").then((r) => r[0]?.count || 0),
      SELECT.from(Products).columns("count(1) as count").then((r) => r[0]?.count || 0),
    ]);
    const msg = `Vendors: ${vendorCount}, Products: ${productCount}`;
    console.log(msg);
    return { vendorCount, productCount };
  });

  // Before creating product(s) set discount according to price rules
  this.before("CREATE", "Products", (req) => {
    const applyDiscount = (item) => {
      const price = Number(item.price) || 0;
      if (price > 100) item.discount = 15.00;
      else if (price > 50) item.discount = 10.00;
      else item.discount = 0.00;
    };
    if (Array.isArray(req.data)) {
      req.data.forEach(applyDiscount);
    } else if (req.data) {
      applyDiscount(req.data);
    }
  });

  // After reading product(s) log actual price after discount
  this.after("READ", "Products", (each) => {
    const items = Array.isArray(each) ? each : [each];
    items.forEach((p) => {
      if (!p) return;
      const price = Number(p.price) || 0;
      const discount = Number(p.discount) || 0;
      const actual = +(price * (1 - discount / 100)).toFixed(2);
      console.log(`Product ${p.ID || p.name}: price ${price} discount ${discount}% -> actual ${actual}`);
    });
  });


  // Bound action handler for vendorReviews using OrchestrationClient and GPT 5.4
  this.on("vendorReviews", "Vendors", async (req) => {
    console.log("[vendorReviews] Action triggered");
    let id = null;
    if (req.params) {
      id = req.params[0] || req.params.ID || Object.values(req.params)[0];
    }
    // Normalize id when caller provides a parameter object like { ID: 'uuid' }
    if (id && typeof id === 'object') {
      if (id.ID) id = id.ID;
      else if (id.id) id = id.id;
      else {
        // attempt to extract first value
        const vals = Object.values(id);
        if (vals.length) id = vals[0];
      }
    }
    console.log("[vendorReviews] Resolved vendor ID:", id, "(type:", typeof id, ")");
    if (!id && req.data && req.data.vendor && req.data.vendor.ID) id = req.data.vendor.ID;
    let vendor = null;
    if (id) {
      vendor = await cds.run(SELECT.one.from(Vendors).where({ ID: id }));
      console.log("[vendorReviews] Vendor from DB:", vendor);
    }
    if (!vendor) {
      console.log("[vendorReviews] Vendor not found, rejecting");
      return req.reject(404, "Vendor not found");
    }
    const vendorName = vendor.name || "this vendor";
    console.log("[vendorReviews] Vendor name:", vendorName);

    // OrchestrationClient setup
    const orchestrationDeploymentConfig = {
      deploymentId: process.env.AI_CORE_ORCHESTRATION_DEPLOYMENT_ID || 'd94e0c19e7d2a055'
    };
    console.log("[vendorReviews] Orchestration deployment config:", orchestrationDeploymentConfig);

    const reviewClient = new OrchestrationClient({
      promptTemplating: {
        model: { name: 'gpt-5.4' },
        prompt: {
          template: [
            { role: 'system', content: 'You are a vendor review assistant. Respond with valid JSON only.' },
            { role: 'user', content: `
Write a short, friendly, fictitious 4-line customer review for the following vendor:
Vendor name: {{?name}}

Return only valid JSON in this format:
{
  "review": "string"
}

Rules:
- review should be 4 lines, each line brief and distinct.
- Do not include markdown or extra text.
` }
          ]
        }
      }
    }, orchestrationDeploymentConfig);

    // Helper to extract JSON from LLM output
    const extractJson = (content) => {
      if (!content) throw new Error('LLM returned empty content');
      const trimmed = content.trim();
      const withoutFences = trimmed
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(withoutFences);
    };

    // Call LLM for review
    let reviewText = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[vendorReviews][LLM][attempt ${attempt}] Calling reviewClient.chatCompletion`);
        const response = await reviewClient.chatCompletion({
          placeholderValues: { name: vendorName }
        });
        const rawContent = response.getContent();
        console.log(`[vendorReviews][LLM][attempt ${attempt}] Raw content:`, rawContent);
        const llmOutput = extractJson(rawContent);
        console.log(`[vendorReviews][LLM][attempt ${attempt}] LLM output:`, llmOutput);
        reviewText = String(llmOutput.review || '').trim();
        if (reviewText) break;
      } catch (error) {
        lastError = error;
        console.log(`[vendorReviews][LLM][attempt ${attempt}] error:`, error.message);
      }
    }
    if (!reviewText) {
      console.log("[vendorReviews] LLM failed, using fallback review");
      reviewText = `${vendorName} is a reliable and friendly vendor.\nQuality and service are always consistent.\nCommunication is prompt and professional.\nHighly recommended for any partnership.`;
    }

    // Update the reviews field in the underlying db.Vendors entity (not the service projection)
    console.log("[vendorReviews] Updating vendor review in DB (db.Vendors)");
    try {
      await cds.run(UPDATE('my.vendors.Vendors').set({ reviews: reviewText }).where({ ID: vendor.ID }));
      console.log("[vendorReviews] DB update successful");
    } catch (e) {
      console.error('[vendorReviews] DB update failed', e);
      throw e;
    }

    console.log("[vendorReviews] Returning reviewText:", reviewText);
    return reviewText;
  });
});
