function e(i,r=!0){if(i==null||isNaN(i))return r?"₹0":"0";const t=Number(i).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2});return r?`₹${t}`:t}export{e as f};
