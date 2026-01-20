import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css               *//* empty css                *//* empty css               */import{s as r}from"./ui-D1Am529b.js";import"./api-BqPqbFNt.js";const f=()=>new Promise(t=>{window.Auth?t(window.Auth):setTimeout(()=>t(f()),10)}),d=await f();let g=[],o=null,i=[],v=null;async function S(){v=await d.requireAuth(["admin","staff"]),v&&(T(),await h(),await k())}function T(){const t=document.getElementById("queueViewBtn"),e=document.getElementById("batchViewBtn");t?.addEventListener("click",()=>w("queue")),e?.addEventListener("click",()=>w("batch"))}async function w(t){document.querySelectorAll(".view-btn").forEach(e=>{e.classList.toggle("active",e.dataset.view===t)}),document.querySelectorAll(".view-container").forEach(e=>{e.classList.toggle("active",e.id===`${t}View`)}),t==="batch"&&await q()}async function h(){try{const t=await fetch("/api/packing/queue",{credentials:"include"});if(!t.ok)throw new Error("Failed to load queue");g=(await t.json()).data||[],B()}catch(t){console.error("Error loading queue:",t),r("Failed to load packing queue","error")}}async function k(){try{const t=await fetch("/api/packing/stats",{credentials:"include"});if(!t.ok)return;const a=(await t.json()).data;document.getElementById("statTotal").textContent=a.total||0,document.getElementById("statPending").textContent=a.notStarted||0,document.getElementById("statInProgress").textContent=a.inProgress||0,document.getElementById("statCompleted").textContent=a.completed||0}catch(t){console.error("Error loading stats:",t)}}function B(){const t=document.getElementById("queueList");if(!t)return;if(g.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders waiting to be packed</p>
            </div>
        `;return}const e={};g.forEach(a=>{const s=a.batch?.batchNumber||"No Batch";e[s]||(e[s]={batch:a.batch,orders:[]}),e[s].orders.push(a)}),t.innerHTML=Object.entries(e).map(([a,s])=>`
        <div class="batch-group">
            <div class="batch-header">
                <span class="batch-name">${a}</span>
                <span class="batch-count">${s.orders.length} orders</span>
            </div>
            <div class="batch-orders">
                ${s.orders.map(n=>P(n)).join("")}
            </div>
        </div>
    `).join(""),t.querySelectorAll(".order-card").forEach(a=>{a.addEventListener("click",()=>{const s=a.dataset.orderId;$(s)})})}function P(t){const e=C(t.packingStatus),a=M(t.packingStatus),s=t.packingStatus==="in_progress"?`${t.packedItems}/${t.itemCount}`:"";return`
        <div class="order-card card-animated ${e}" data-order-id="${t._id}">
            <div class="order-main">
                <div class="order-info">
                    <span class="order-number">${t.orderNumber}</span>
                    <span class="customer-name">${t.customer?.name||"Unknown"}</span>
                </div>
                <div class="order-meta">
                    <span class="item-count">${t.itemCount} items</span>
                    <span class="order-amount">&#8377;${t.totalAmount?.toLocaleString()||0}</span>
                </div>
            </div>
            <div class="order-status">
                <span class="status-badge ${e}">${a}</span>
                ${s?`<span class="progress-mini">${s}</span>`:""}
            </div>
            <div class="order-action">
                <span class="action-arrow">&rarr;</span>
            </div>
        </div>
    `}function C(t){switch(t){case"in_progress":return"status-progress";case"completed":return"status-done";case"on_hold":return"status-hold";default:return"status-pending"}}function M(t){switch(t){case"in_progress":return"In Progress";case"completed":return"Packed";case"on_hold":return"On Hold";default:return"Ready"}}async function q(){const t=document.getElementById("batchList");if(t){t.innerHTML='<div class="loading">Loading batches...</div>';try{const e=await fetch("/api/batches/today",{credentials:"include"});if(!e.ok)throw new Error("Failed to load batches");const s=(await e.json()).data||[];if(s.length===0){t.innerHTML=`
                <div class="empty-state">
                    <h3>No batches today</h3>
                    <p>Batches will appear here when orders come in</p>
                </div>
            `;return}const n=await Promise.all(s.map(async c=>{try{const p=await fetch(`/api/packing/batch/${c._id}/summary`,{credentials:"include"});if(p.ok)return(await p.json()).data}catch(p){console.error("Error loading batch summary:",p)}return{batch:c,orderStats:{},products:[]}}));t.innerHTML=n.map(c=>L(c)).join("")}catch(e){console.error("Error loading batch view:",e),t.innerHTML='<div class="error-state">Failed to load batches</div>'}}}function L(t){const{batch:e,orderStats:a,products:s}=t,n=a.total>0?Math.round(a.completed/a.total*100):0;return`
        <div class="batch-summary-card">
            <div class="batch-summary-header">
                <div>
                    <h3>${e.batchNumber}</h3>
                    <span class="batch-type">${e.batchType} Batch</span>
                </div>
                <div class="batch-progress-ring" data-progress="${n}">
                    <span>${n}%</span>
                </div>
            </div>

            <div class="batch-order-stats">
                <div class="stat-mini">
                    <span class="stat-value">${a.total||0}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-mini pending">
                    <span class="stat-value">${a.notStarted||0}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-mini progress">
                    <span class="stat-value">${a.inProgress||0}</span>
                    <span class="stat-label">Packing</span>
                </div>
                <div class="stat-mini done">
                    <span class="stat-value">${a.completed||0}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>

            ${s.length>0?`
                <div class="batch-products">
                    <h4>Products to Pack</h4>
                    <div class="product-list">
                        ${s.slice(0,5).map(c=>`
                            <div class="product-row ${c.remaining<=0?"done":""}">
                                <span class="product-name">${c.productName}</span>
                                <span class="product-qty">
                                    ${c.totalPacked}/${c.totalOrdered} ${c.unit}
                                </span>
                                <div class="product-progress-bar">
                                    <div class="product-progress-fill" style="width: ${c.percentPacked}%"></div>
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
    `}async function $(t){const e=document.getElementById("packingModal");if(e){e.classList.add("active"),document.body.style.overflow="hidden",document.getElementById("packingModalBody").innerHTML='<div class="loading">Loading order...</div>',document.getElementById("completeBtn").disabled=!0;try{const a=await fetch(`/api/packing/${t}`,{credentials:"include"});if(!a.ok)throw new Error("Failed to load order");o=(await a.json()).data,o.packingDetails.status==="not_started"?await F(t):o.packingDetails.status==="on_hold"&&await j(t),i=o.packingDetails.items||[],u()}catch(a){console.error("Error loading order:",a),r("Failed to load order details","error"),m()}}}async function F(t){try{const e=await d.ensureCsrfToken(),a=await fetch(`/api/packing/${t}/start`,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":e},credentials:"include"});if(!a.ok){const n=await a.json();throw new Error(n.message||"Failed to start packing")}i=(await a.json()).data.items||[],o.packingDetails.status="in_progress"}catch(e){throw console.error("Error starting packing:",e),e}}async function j(t){try{const e=await d.ensureCsrfToken(),a=await fetch(`/api/packing/${t}/resume`,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":e},credentials:"include"});if(!a.ok){const s=await a.json();throw new Error(s.message||"Failed to resume packing")}o.packingDetails.status="in_progress"}catch(e){throw console.error("Error resuming packing:",e),e}}function u(){document.getElementById("packingModalTitle").textContent=`Pack ${o.orderNumber}`,document.getElementById("packingModalSubtitle").textContent=`${o.customer?.name||"Unknown"} • ${o.customer?.phone||""}`,b();const t=document.getElementById("packingModalBody");t.innerHTML=`
        <div class="order-details">
            ${o.deliveryAddress?`
                <div class="delivery-info">
                    <span class="label">Deliver to:</span>
                    <span class="value">${o.deliveryAddress}</span>
                </div>
            `:""}
            ${o.notes?`
                <div class="order-notes">
                    <span class="label">Notes:</span>
                    <span class="value">${o.notes}</span>
                </div>
            `:""}
        </div>

        <div class="checklist-header">
            <span>Items to Pack</span>
            <button class="btn-mini" onclick="markAllPacked()">Mark All Packed</button>
        </div>

        <div class="packing-checklist">
            ${i.map((s,n)=>A(s,n)).join("")}
        </div>
    `,D(),E();const e=o.packingDetails.issues?.length>0||i.some(s=>s.status!=="packed"&&s.status!=="pending"),a=document.getElementById("packingAcknowledgement");e?a.style.display="block":a.style.display="none"}function A(t,e){const a=t.status!=="pending",s=O(t.status);return`
        <div class="checklist-item ${Q(t.status)}" data-index="${e}" data-product-id="${t.product}">
            <div class="item-main">
                <div class="item-check ${a?"checked":""}" onclick="toggleItemStatus(${e})">
                    ${s}
                </div>
                <div class="item-details">
                    <span class="item-name">${t.productName}</span>
                    <span class="item-qty">Ordered: ${t.orderedQuantity} ${t.unit}</span>
                </div>
            </div>

            <div class="item-input">
                <input type="number"
                    class="qty-input"
                    placeholder="Qty"
                    value="${t.packedQuantity??""}"
                    data-index="${e}"
                    step="0.01"
                    min="0"
                    ${a&&t.status==="packed",""}
                >
                <span class="unit-label">${t.unit}</span>
            </div>

            <div class="item-status">
                <select class="status-select" data-index="${e}" onchange="updateItemStatus(${e}, this.value)">
                    <option value="pending" ${t.status==="pending"?"selected":""}>Pending</option>
                    <option value="packed" ${t.status==="packed"?"selected":""}>Packed</option>
                    <option value="short" ${t.status==="short"?"selected":""}>Short</option>
                    <option value="damaged" ${t.status==="damaged"?"selected":""}>Damaged</option>
                    <option value="unavailable" ${t.status==="unavailable"?"selected":""}>Unavailable</option>
                </select>
            </div>

            ${t.status!=="packed"&&t.status!=="pending"?`
                <div class="item-notes">
                    <input type="text"
                        class="notes-input"
                        placeholder="Add note..."
                        value="${t.notes||""}"
                        data-index="${e}"
                    >
                </div>
            `:""}
        </div>
    `}function O(t){switch(t){case"packed":return"&#10003;";case"short":return"&#9888;";case"damaged":return"&#10006;";case"unavailable":return"&#8709;";default:return""}}function Q(t){switch(t){case"packed":return"item-packed";case"short":return"item-short";case"damaged":return"item-damaged";case"unavailable":return"item-unavailable";default:return"item-pending"}}function D(){document.querySelectorAll(".qty-input").forEach(t=>{t.addEventListener("change",async e=>{const a=parseInt(e.target.dataset.index),s=parseFloat(e.target.value)||0;i[a].packedQuantity=s;const n=i[a];s>0&&s<n.orderedQuantity&&n.status==="pending"&&(n.status="short",u()),await l(a)})}),document.querySelectorAll(".notes-input").forEach(t=>{t.addEventListener("change",async e=>{const a=parseInt(e.target.dataset.index);i[a].notes=e.target.value,await l(a)})})}async function x(t){const e=i[t];if(e.status==="pending"){const a=document.querySelector(`.qty-input[data-index="${t}"]`),s=parseFloat(a?.value)||e.orderedQuantity;e.packedQuantity=s,s>=e.orderedQuantity?e.status="packed":s>0&&(e.status="short")}else e.status==="packed"&&(e.status="pending");await l(t),u()}async function H(t,e){const a=i[t];a.status=e;const s=document.querySelector(`.qty-input[data-index="${t}"]`);e==="packed"?a.packedQuantity=parseFloat(s?.value)||a.orderedQuantity:e==="unavailable"&&(a.packedQuantity=0),await l(t),u()}async function l(t){const e=i[t];try{const a=await d.ensureCsrfToken(),s=await fetch(`/api/packing/${o._id}/item/${e.product}`,{method:"PUT",headers:{"Content-Type":"application/json","X-CSRF-Token":a},credentials:"include",body:JSON.stringify({status:e.status,packedQuantity:e.packedQuantity,notes:e.notes})});if(!s.ok)throw new Error("Failed to save");const n=await s.json();n.data.issues&&(o.packingDetails.issues=n.data.issues),b(),E(),y()}catch(a){console.error("Error saving item:",a),r("Failed to save changes","error")}}async function N(){for(let t=0;t<i.length;t++){const e=i[t];e.status==="pending"&&(e.status="packed",e.packedQuantity=e.orderedQuantity,await l(t))}u()}function b(){const t=i.length,e=i.filter(s=>s.status!=="pending").length,a=t>0?Math.round(e/t*100):0;document.getElementById("progressFill").style.width=`${a}%`,document.getElementById("progressText").textContent=`${e}/${t} items`}function E(){const t=o.packingDetails.issues||[],e=document.getElementById("packingIssues"),a=document.getElementById("issuesList");t.length>0?(e.style.display="block",a.innerHTML=t.map(c=>`
            <div class="issue-item issue-${c.issueType}">
                <span class="issue-product">${c.productName}</span>
                <span class="issue-type">${c.issueType}</span>
                <span class="issue-qty">${c.quantityAffected} affected</span>
                ${c.description?`<span class="issue-desc">${c.description}</span>`:""}
            </div>
        `).join("")):e.style.display="none";const s=document.getElementById("packingAcknowledgement");t.length>0||i.some(c=>c.status!=="packed"&&c.status!=="pending")?s.style.display="block":s.style.display="none",y()}function y(){const t=document.getElementById("completeBtn"),e=i.every(n=>n.status!=="pending"),a=o.packingDetails.issues?.length>0||i.some(n=>n.status!=="packed"&&n.status!=="pending"),s=document.getElementById("acknowledgeCheckbox")?.checked||!a;t.disabled=!e||a&&!s}function _(){document.getElementById("holdModal").classList.add("active")}function I(){document.getElementById("holdModal").classList.remove("active"),document.getElementById("holdReason").value=""}async function R(){const t=document.getElementById("holdReason").value.trim();if(!t){r("Please provide a reason","error");return}try{const e=await d.ensureCsrfToken();if(!(await fetch(`/api/packing/${o._id}/hold`,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":e},credentials:"include",body:JSON.stringify({reason:t})})).ok)throw new Error("Failed to hold order");r("Order put on hold","warning"),I(),m(),await h(),await k()}catch(e){console.error("Error holding order:",e),r("Failed to hold order","error")}}async function V(){const t=o.packingDetails.issues?.length>0||i.some(a=>a.status!=="packed"&&a.status!=="pending"),e=document.getElementById("acknowledgeCheckbox")?.checked;if(t&&!e){r("Please acknowledge issues before completing","error");return}try{const a=await d.ensureCsrfToken(),s=await fetch(`/api/packing/${o._id}/complete`,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":a},credentials:"include",body:JSON.stringify({acknowledgeIssues:e||!1})});if(!s.ok){const n=await s.json();throw new Error(n.message||"Failed to complete packing")}r("Packing completed!","success"),m(),await h(),await k()}catch(a){console.error("Error completing packing:",a),r(a.message||"Failed to complete packing","error")}}function m(){document.getElementById("packingModal").classList.remove("active"),document.body.style.overflow="",o=null,i=[]}function U(){document.getElementById("printModal").classList.remove("active")}function X(){window.print()}window.openPackingModal=$;window.closePackingModal=m;window.closeHoldModal=I;window.confirmHold=R;window.holdOrder=_;window.completePacking=V;window.toggleItemStatus=x;window.updateItemStatus=H;window.markAllPacked=N;window.closePrintModal=U;window.printSlip=X;document.getElementById("acknowledgeCheckbox")?.addEventListener("change",y);S();
