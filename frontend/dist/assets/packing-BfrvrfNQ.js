import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css                */import{s as u}from"./ui-Bns_kLia.js";import"./api-CCOw0EgE.js";function c(t){if(t==null)return"";const a=document.createElement("div");return a.textContent=String(t),a.innerHTML}const p=(t=1e4)=>new Promise((a,e)=>{const s=Date.now(),r=()=>{if(window.Auth)return a(window.Auth);if(Date.now()-s>t)return e(new Error("Auth not available"));setTimeout(r,50)};r()}),m=await p();let o=[],d=null;async function h(){d=await m.requireAuth(["admin","staff"]),d&&(g(),await v(),await w())}function g(){const t=document.getElementById("queueViewBtn"),a=document.getElementById("batchViewBtn");t?.addEventListener("click",()=>l("queue")),a?.addEventListener("click",()=>l("batch"))}async function l(t){document.querySelectorAll(".view-btn").forEach(a=>{a.classList.toggle("active",a.dataset.view===t)}),document.querySelectorAll(".view-container").forEach(a=>{a.classList.toggle("active",a.id===`${t}View`)}),t==="batch"&&await k()}async function v(){try{const t=await fetch("/api/packing/queue",{credentials:"include"});if(!t.ok)throw new Error("Failed to load queue");o=(await t.json()).data||[],f()}catch(t){console.error("Error loading queue:",t),u("Failed to load packing queue","error")}}async function w(){try{const t=await fetch("/api/packing/stats",{credentials:"include"});if(!t.ok)return;const e=(await t.json()).data;document.getElementById("statTotal").textContent=e.total||0,document.getElementById("statPending").textContent=e.notStarted||0,document.getElementById("statInProgress").textContent=e.inProgress||0,document.getElementById("statCompleted").textContent=e.completed||0}catch(t){console.error("Error loading stats:",t)}}function f(){const t=document.getElementById("queueList");if(!t)return;if(o.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders waiting to be packed</p>
            </div>
        `;return}const a={};o.forEach(e=>{const s=e.batch?.batchNumber||"No Batch";a[s]||(a[s]={batch:e.batch,orders:[]}),a[s].orders.push(e)}),t.innerHTML=Object.entries(a).map(([e,s])=>`
        <div class="batch-group">
            <div class="batch-header">
                <span class="batch-name">${c(e)}</span>
                <span class="batch-count">${s.orders.length} orders</span>
            </div>
            <div class="batch-orders">
                ${s.orders.map(r=>b(r)).join("")}
            </div>
        </div>
    `).join(""),t.querySelectorAll(".order-card").forEach(e=>{e.addEventListener("click",()=>{const s=e.dataset.orderId;window.location.href=`/pages/orders/?order=${s}&action=pack`})})}function b(t){const a=y(t.packingStatus),e=$(t.packingStatus),s=t.packingStatus==="in_progress"?`${t.packedItems}/${t.itemCount}`:"";return`
        <div class="order-card card-animated ${a}" data-order-id="${c(t._id)}">
            <div class="order-main">
                <div class="order-info">
                    <span class="order-number">${c(t.orderNumber)}</span>
                    <span class="customer-name">${c(t.customer?.name||"Unknown")}</span>
                </div>
                <div class="order-meta">
                    <span class="item-count">${t.itemCount} items</span>
                    <span class="order-amount">&#8377;${t.totalAmount?.toLocaleString()||0}</span>
                </div>
            </div>
            <div class="order-status">
                <span class="status-badge ${a}">${e}</span>
                ${s?`<span class="progress-mini">${s}</span>`:""}
            </div>
            <div class="order-action">
                <span class="action-arrow">&rarr;</span>
            </div>
        </div>
    `}function y(t){switch(t){case"in_progress":return"status-progress";case"completed":return"status-done";case"on_hold":return"status-hold";default:return"status-pending"}}function $(t){switch(t){case"in_progress":return"In Progress";case"completed":return"Packed";case"on_hold":return"On Hold";default:return"Ready"}}async function k(){const t=document.getElementById("batchList");if(t){t.innerHTML='<div class="loading">Loading batches...</div>';try{const a=await fetch("/api/batches/today",{credentials:"include"});if(!a.ok)throw new Error("Failed to load batches");const s=(await a.json()).data||[];if(s.length===0){t.innerHTML=`
                <div class="empty-state">
                    <h3>No batches today</h3>
                    <p>Batches will appear here when orders come in</p>
                </div>
            `;return}const r=await Promise.all(s.map(async n=>{try{const i=await fetch(`/api/packing/batch/${n._id}/summary`,{credentials:"include"});if(i.ok)return(await i.json()).data}catch(i){console.error("Error loading batch summary:",i)}return{batch:n,orderStats:{},products:[]}}));t.innerHTML=r.map(n=>E(n)).join("")}catch(a){console.error("Error loading batch view:",a),t.innerHTML='<div class="error-state">Failed to load batches</div>'}}}function E(t){const{batch:a,orderStats:e,products:s}=t,r=e.total>0?Math.round(e.completed/e.total*100):0;return`
        <div class="batch-summary-card">
            <div class="batch-summary-header">
                <div>
                    <h3>${c(a.batchNumber)}</h3>
                    <span class="batch-type">${c(a.batchType)} Batch</span>
                </div>
                <div class="batch-progress-ring" data-progress="${r}">
                    <span>${r}%</span>
                </div>
            </div>

            <div class="batch-order-stats">
                <div class="stat-mini">
                    <span class="stat-value">${e.total||0}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-mini pending">
                    <span class="stat-value">${e.notStarted||0}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-mini progress">
                    <span class="stat-value">${e.inProgress||0}</span>
                    <span class="stat-label">Packing</span>
                </div>
                <div class="stat-mini done">
                    <span class="stat-value">${e.completed||0}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>

            ${s.length>0?`
                <div class="batch-products">
                    <h4>Products to Pack</h4>
                    <div class="product-list">
                        ${s.slice(0,5).map(n=>`
                            <div class="product-row ${n.remaining<=0?"done":""}">
                                <span class="product-name">${c(n.productName)}</span>
                                <span class="product-qty">
                                    ${n.totalPacked}/${n.totalOrdered} ${c(n.unit)}
                                </span>
                                <div class="product-progress-bar">
                                    <div class="product-progress-fill" style="width: ${n.percentPacked}%"></div>
                                </div>
                            </div>
                        `).join("")}
                        ${s.length>5?`
                            <div class="more-products">+${s.length-5} more products</div>
                        `:""}
                    </div>
                </div>
            `:""}
        </div>
    `}function B(){const t=document.getElementById("packingHelpBanner");t&&(t.style.display="none",localStorage.setItem("packingHelpDismissed","true"))}function P(){const t=localStorage.getItem("packingHelpDismissed"),a=document.getElementById("packingHelpBanner");a&&t==="true"&&(a.style.display="none")}P();function S(){document.getElementById("printModal").classList.remove("active")}function I(){window.print()}window.closePrintModal=S;window.printSlip=I;window.dismissPackingHelp=B;h();
