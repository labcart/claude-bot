# RDP Login Issue - VPS Deployment

## Problem
Cannot login to XFCE4 desktop via RDP on VPS (46.62.243.56)

## What's Installed
- XFCE4 desktop environment (working)
- XRDP service (running, port 3389)
- Node.js, npm, PM2 (all working)

## Failed Attempts
1. **Root user login**: PAM authentication fails - Ubuntu blocks root RDP logins by default
2. **Created `claude` user**: Still fails with same PAM authentication error

## Error Log
```
[ERROR] pam_authenticate failed: Authentication failure
[INFO ] AUTHFAIL: user=claude ip=::ffff:24.145.64.189
```

## Passwords Tried
- Root: `CloudBot2025!`
- Claude user: `CloudBot2025!`

Both fail at RDP login screen (Session: Xorg)

## What Works
- SSH login (with key)
- XRDP service is running
- Desktop environment installed
- Network connectivity

## What Doesn't Work
- Any RDP authentication (root or regular user)
- PAM module rejecting all password attempts

## Solution Applied (2025-11-01)

### Root Cause
The `xrdp` user was not a member of the `ssl-cert` group, which prevented it from accessing the SSL certificates needed for secure RDP connections.

### Fixes Applied

1. **Added xrdp user to ssl-cert group**
   ```bash
   usermod -a -G ssl-cert xrdp
   ```
   This is the most common cause of XRDP authentication failures on Ubuntu.

2. **Simplified test password**
   - Changed `claude` user password to `testpass123`
   - Rules out keyboard layout issues with special characters like `!`

3. **Updated PAM configuration**
   - Created proper PAM config at `/etc/pam.d/xrdp-sesman`
   - Enabled debug logging for troubleshooting
   - Uses `pam_unix.so` with `nullok` to allow password authentication

4. **Restarted services**
   ```bash
   systemctl restart xrdp xrdp-sesman
   ```

### Test Login Credentials
- **IP**: `46.62.243.56:3389`
- **Username**: `claude`
- **Password**: `testpass123`
- **Session**: Select `Xorg` from dropdown

### If Still Failing
Check detailed PAM logs:
```bash
ssh root@46.62.243.56 'tail -50 /var/log/auth.log | grep -A 5 -B 5 pam'
```

### Status
⏳ **PENDING TEST** - Awaiting RDP login attempt with new configuration
