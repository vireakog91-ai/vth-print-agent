# VTH Mart Print Agent

Small Windows-local service for direct thermal receipt printing without QZ Tray.
It discovers printers installed in Windows and sends raw ESC/POS data through the Windows print spooler.

## Run locally

From the repository root:

```powershell
npm install
npm start --workspace=apps/print-agent
```

The agent listens only on `127.0.0.1:17654`.

Check it:

```powershell
Invoke-RestMethod http://127.0.0.1:17654/health
Invoke-RestMethod http://127.0.0.1:17654/printers
```

## Client setup

Install the thermal printer using its normal Windows driver, then start this agent on every POS computer. In VTH Mart, select:

`Settings → Thermal Printer & Hardware Setup → Direct Windows Printer (VTH Agent)`

Click `Refresh Printers`, select the Windows printer queue, and run a test receipt.

The current MVP expects Node.js 20+ on the POS computer. A signed Windows installer/service wrapper can be added after the print flow is accepted.
