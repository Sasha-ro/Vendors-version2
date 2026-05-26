const cds = require("@sap/cds");

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
    // If running in Fiori/UI5, you can return the counts for MessageToast
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

  // Bound action handler for vendorReviews
  this.on("vendorReviews", "Vendors", async (req) => {
    // try to determine vendor ID from request params
    let id = null;
    if (req.params) {
      id = req.params[0] || req.params.ID || Object.values(req.params)[0];
    }
    if (!id && req.data && req.data.vendor && req.data.vendor.ID) id = req.data.vendor.ID;

    // fetch vendor to include name in prompt
    let vendor = null;
    if (id) {
      vendor = await cds.run(SELECT.one.from(Vendors).where({ ID: id }));
    }

    const vendorName = (vendor && vendor.name) ? vendor.name : (req.data && req.data.vendor && req.data.vendor.name) || "this vendor";

    // Try calling an external LLM if OPENAI_API_KEY present, otherwise generate a local fictitious review
    const generateLocalReview = (name) => {
      const lines = [
        `${name} consistently delivers on time and with friendly service.`,
        `Quality is solid — packaging and documentation are reliable.`,
        `Communication is responsive and they handle issues professionally.`,
        `Overall a dependable partner we enjoy working with.`,
      ];
      return lines.join("\n");
    };

    const callLLM = async (prompt) => {
      const key = process.env.OPENAI_API_KEY;
      const url = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      if (!key) return null;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 200,
          }),
        });
        if (!res.ok) return null;
        const body = await res.json();
        // try common response shape
        const content = body.choices && body.choices[0] && (body.choices[0].message?.content || body.choices[0].text);
        return content ? content.trim() : null;
      } catch (e) {
        console.error("LLM call failed", e);
        return null;
      }
    };

    const prompt = `Write a short, friendly, fictitious 4-line customer review for vendor named "${vendorName}". Each line should be brief and distinct.`;

    let review = await callLLM(prompt);
    if (!review) review = generateLocalReview(vendorName);

    // return plain string (CDS will serialize)
    return review;
  });
});
