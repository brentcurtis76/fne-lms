#!/usr/bin/env node

const { exec } = require('child_process');
const https = require('https');
const dns = require('dns');
const os = require('os');

console.log('=== Network Configuration Check ===\n');

// Check system info
console.log('System Info:');
console.log('- Platform:', os.platform());
console.log('- Release:', os.release());
console.log('- Node Version:', process.version);
console.log('- Network Interfaces:', Object.keys(os.networkInterfaces()).join(', '));

// Check environment variables for proxy
console.log('\nProxy Environment Variables:');
const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy'];
proxyVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`- ${varName}: ${process.env[varName]}`);
  }
});

// Check DNS resolution
console.log('\nDNS Resolution Test:');
dns.lookup('sxlogxqzmarhqsblxmtj.supabase.co', (err, address, family) => {
  if (err) {
    console.log('- DNS Error:', err.message);
  } else {
    console.log('- Resolved to:', address, `(IPv${family})`);
  }
});

// Check macOS network configuration
if (os.platform() === 'darwin') {
  console.log('\nmacOS Network Configuration:');
  
  // Check system proxy settings
  exec('networksetup -getwebproxy Wi-Fi', (error, stdout) => {
    console.log('\nHTTP Proxy (Wi-Fi):');
    console.log(stdout || 'No proxy configured');
  });
  
  exec('networksetup -getsecurewebproxy Wi-Fi', (error, stdout) => {
    console.log('\nHTTPS Proxy (Wi-Fi):');
    console.log(stdout || 'No proxy configured');
  });
  
  // Check for VPN
  exec('scutil --nc list', (error, stdout) => {
    console.log('\nVPN Configurations:');
    console.log(stdout || 'No VPN configurations found');
  });
  
  // Check firewall status
  exec('sudo pfctl -s info 2>/dev/null || echo "Firewall check requires sudo"', (error, stdout) => {
    console.log('\nFirewall Status:');
    console.log(stdout);
  });
}

// Test HTTPS connection
console.log('\nTesting HTTPS connection to Supabase...');
const testUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co/auth/v1/health';
https.get(testUrl, (res) => {
  console.log('- Status Code:', res.statusCode);
  console.log('- Headers:', JSON.stringify(res.headers, null, 2));
}).on('error', (err) => {
  console.log('- Connection Error:', err.message);
});

// Check for security software
console.log('\nChecking for security software...');
exec('ps aux | grep -i "littlesnitch\\|tripmode\\|proxyman\\|charles\\|wireshark" | grep -v grep', (error, stdout) => {
  if (stdout) {
    console.log('Found potential network interceptors:');
    console.log(stdout);
  } else {
    console.log('No common network interceptors detected in running processes');
  }
});