import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css                */import{s as m}from"./ui-Bns_kLia.js";import"./api-CCOw0EgE.js";function s(t){return t==null?"":String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}const C=(t=1e4)=>new Promise((e,n)=>{const o=Date.now(),r=()=>{if(window.Auth)return e(window.Auth);if(Date.now()-o>t)return n(new Error("Auth not available"));setTimeout(r,50)};r()}),v=await C();let c=[],u=null,a=null,p=0;async function b(){await v.requireAuth(["admin","staff"])&&(R(),await w())}async function w(){try{const t=await fetch("/api/reconciliation/pending",{credentials:"include"});if(!t.ok)throw new Error("Failed to load pending orders");c=(await t.json()).data||[],L(),T()}catch(t){console.error("Error loading pending orders:",t),m("Failed to load orders","error")}}function L(){document.getElementById("statTotal").textContent=c.length+p,document.getElementById("statPending").textContent=c.length,document.getElementById("statCompleted").textContent=p}function T(){const t=document.getElementById("orderList");if(t){if(c.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders pending reconciliation</p>
            </div>
        `;return}t.innerHTML=c.map(e=>{const n=s(S(e.customer?.name||"U")),o=s(e.customer?.name||"Unknown"),r=s(e.orderNumber),i=s(e.batch?.batchType||"1st");return`
            <div class="order-card card-animated" data-order-id="${s(e._id)}">
                <div class="order-avatar">${n}</div>
                <div class="order-details">
                    <div class="order-customer">${o}</div>
                    <div class="order-meta">
                        <span class="order-number">${r}</span>
                        ${e.batch?`<span class="order-batch">${i}</span>`:""}
                    </div>
                    <div class="order-items">${e.itemCount} items</div>
                </div>
                <div class="order-amount">&#8377;${e.totalAmount?.toLocaleString()||0}</div>
                <div class="order-arrow">&rarr;</div>
            </div>
        `}).join(""),t.querySelectorAll(".order-card").forEach(e=>{e.addEventListener("click",()=>{const n=e.dataset.orderId;n&&h(n)})})}}function S(t){return t.split(" ").map(e=>e[0]).join("").toUpperCase().slice(0,2)}async function h(t){try{u=t,document.getElementById("reconcileModal").classList.add("active"),document.getElementById("reconcileItems").innerHTML='<div class="loading">Loading order details...</div>';const n=await fetch(`/api/reconciliation/${t}`,{credentials:"include"});if(!n.ok){const r=await n.json();throw new Error(r.message||"Failed to load order")}a=(await n.json()).data,document.getElementById("modalTitle").textContent="Reconcile Order",document.getElementById("modalSubtitle").textContent=a.orderNumber,document.getElementById("infoCustomer").textContent=a.customer?.name||"Unknown",document.getElementById("infoTotal").textContent=`₹${a.totalAmount?.toLocaleString()||0}`,k(),E()}catch(e){console.error("Error loading order:",e),m(e.message||"Failed to load order","error"),g()}}function k(){const t=document.getElementById("reconcileItems");a&&(t.innerHTML=a.products.map((e,n)=>{const o=s(e.productName),r=s(e.unit);return`
        <div class="reconcile-item" id="item-${n}" data-index="${n}">
            <div class="item-info">
                <div class="item-name">${o}</div>
                <div class="item-unit">${r} @ ₹${e.rate}</div>
            </div>
            <div class="item-ordered">${e.orderedQty}</div>
            <div class="item-delivered">
                <input type="number"
                    class="qty-input"
                    id="qty-${n}"
                    value="${e.deliveredQty}"
                    min="0"
                    step="0.1"
                    data-original="${e.orderedQty}"
                    data-index="${n}">
            </div>
            <div class="item-reason" id="reason-row-${n}" style="display: none;">
                <input type="text"
                    class="reason-input"
                    id="reason-${n}"
                    placeholder="Reason for change (optional)"
                    maxlength="200">
            </div>
        </div>
    `}).join(""),t.querySelectorAll(".qty-input").forEach(e=>{e.addEventListener("change",()=>I(parseInt(e.dataset.index))),e.addEventListener("input",()=>y(parseInt(e.dataset.index)))}))}function y(t){const e=document.getElementById(`qty-${t}`),n=document.getElementById(`item-${t}`),o=document.getElementById(`reason-row-${t}`),r=parseFloat(e.dataset.original),i=parseFloat(e.value)||0;n.classList.remove("modified","zeroed"),e.classList.remove("modified","zeroed"),i===0?(n.classList.add("zeroed"),e.classList.add("zeroed"),o.style.display="block"):i!==r?(n.classList.add("modified"),e.classList.add("modified"),o.style.display="block"):o.style.display="none",E()}function I(t){y(t)}function E(){if(!a)return;const t=a.totalAmount;let e=0;a.products.forEach((r,i)=>{const l=document.getElementById(`qty-${i}`),d=parseFloat(l?.value)||0;e+=d*r.rate}),e=Math.round(e*100)/100;const n=Math.round((t-e)*100)/100;document.getElementById("summaryOriginal").textContent=`₹${t.toLocaleString()}`,document.getElementById("summaryAdjusted").textContent=`₹${e.toLocaleString()}`;const o=document.getElementById("summaryDifferenceRow");n!==0?(o.style.display="flex",document.getElementById("summaryDifference").textContent=`-₹${n.toLocaleString()}`):o.style.display="none"}async function A(){if(!u||!a)return;const t=document.getElementById("btnComplete");t.disabled=!0,t.textContent="Processing...";try{const e=a.products.map((d,f)=>{const $=document.getElementById(`qty-${f}`),B=document.getElementById(`reason-${f}`);return{product:d.product,deliveredQty:parseFloat($?.value)||0,reason:B?.value||""}}),n=document.getElementById("reconcileNotes")?.value||"",o=await v.ensureCsrfToken(),r={"Content-Type":"application/json"};o&&(r["X-CSRF-Token"]=o);const i=await fetch(`/api/reconciliation/${u}/complete`,{method:"POST",headers:r,credentials:"include",body:JSON.stringify({items:e,notes:n})});if(!i.ok){const d=await i.json();throw new Error(d.message||"Failed to complete reconciliation")}const l=await i.json();m(`Order ${l.data.orderNumber} reconciled successfully`,"success"),p++,g(),await w()}catch(e){console.error("Error completing reconciliation:",e),m(e.message||"Failed to complete reconciliation","error")}finally{t.disabled=!1,t.textContent="Complete Reconciliation"}}function g(){document.getElementById("reconcileModal").classList.remove("active"),u=null,a=null;const e=document.getElementById("reconcileNotes");e&&(e.value="")}function F(){const t=document.getElementById("helpBanner");t&&(t.style.display="none",localStorage.setItem("reconciliationHelpDismissed","true"))}function R(){const t=localStorage.getItem("reconciliationHelpDismissed"),e=document.getElementById("helpBanner");e&&t==="true"&&(e.style.display="none")}window.openReconciliation=h;window.closeModal=g;window.completeReconciliation=A;window.onQuantityChange=I;window.onQuantityInput=y;window.dismissHelp=F;b();
