//(c) Copyright 2011-2014, ARRIS Group, Inc., All rights reserved.
// // !!!!!!!!! forceset default     arDefaults.set( 6, true); // know always 6 getAttr("GW") ? 6 : 3);

var oids = [ ];


function snmpSetIfModified(oid,value,type) {
    var v = snmpGet1(oid);
    if (v != value) {
        $.log("set "+oid+" "+value);
        snmpSet1(oid,value,type);
    }
}

function restoreTable(empty, rowstatus,kkeys,cols,types,rows) {
    var t = _.detect(table, function(f) { return f.rowStatus && f.rowStatus.oid == rowstatus });
    t.getTable();
    if (empty) {
        _.each(t.key.reverse(), function f(key) {
           if (!_.contains(kkeys,key)) {
               snmpSet1(rowstatus+"."+key, "6", "2");
           }
        });
    }
    _.each(kkeys, function (k,i) {
        var has = _.contains(t.key,k) && !empty;
        if (!has)
            snmpSet1(rowstatus+"."+k, "5", "2");
        for (var j=0; j<cols.length;j++) {
            snmpSet1(cols[j]+"."+k, rows[i][j], types[j]);
        }
        if (!has)
            snmpSet1(rowstatus+"."+k, "1", "2");
    });
}



function add(oid, k1, k2) {
    var o = oid.oid + (k1 ? "."+k1 : ".0") + (k2 ? "."+k2  : "");
    k1 = k1 || "";
    k2 = k2 || "";
    //$.log(oid.name+ " " + k1 + " " + k2+ " = "+snmpGet1(o));
    var v=snmpGet1(o);
    oids.push("//"+oid.name+ " " + k1 + " " + k2+ " = "+v);
    oids.push("snmpSetIfModified(\""+o+"\", \""+v+"\","+oid.type+");");
}



function addTable(empty, cols, filter)
{
    if (!filter)
       filter = function() { return true; };
    $.log("add table " + cols[0].table.name);
    var keys = [ ];
    var colOids = [ ];
    var types = [ ];
    var rows = [ ];
    _.each(cols,function(v) { colOids.push(v.oid); types.push(v.type); });
    cols[0].table.getTable(cols, function (index, row, key) {
        if (filter(row, key)) {
            keys.push(key);
            rows.push(row);
        }
    });
    oids.push("//"+cols[0].table.name);
    oids.push("restoreTable("+empty+",'"+cols[0].table.rowStatus.oid+"',"+JSON.stringify(keys)+
         ","+JSON.stringify(colOids)+ ","+JSON.stringify(types)+","+JSON.stringify(rows)+");");
    $.log(oids[oids.length-1]);
    return "";
}

var saveVersion="//2s";
function dosave(post) {
    oids = [ ];

    loadRowStatus();
// basic_setup
    oids.push(saveVersion);
var lan = getLan(0);



add(arCustomSettings);
var SecurityMode = arBssSecurityMode.get(lan);
add(arBssSecurityMode, lan);
add(arBssActive, lan);
add(arBssSSID, lan);
add(arBssSSIDBroadcast, lan);
add(arWiFiOutputPower);
add(WirelessCfg.WiFiChannel);
if (SecurityMode == 1) {
    var ckey = arWEPCurrentKey.get(lan);
    add(arWEPCurrentKey, lan);
    add(WEPTable.WEPEncryptionMode, lan)
    add(arWEP64BitKeyValue, lan, ckey);
    add(arWEP128BitKeyValue, lan, ckey);
} else if (SecurityMode == 2 || SecurityMode == 3 || SecurityMode == 7) {
    add(arWPAAlgorithm, lan);
    add(arWPAPreSharedKey, lan);
    add(arWpsMode); // nb: not snmp boolean
} else if (SecurityMode == 4 || SecurityMode == 5 || SecurityMode == 8) {
    add(arRadiusAddressType, lan);
    add(arRadiusAddress, lan);
    add(arRadiusPort, lan);
    add(arRadiusKey, lan);
    add(arWPAAlgorithm, lan);
    add(arRadiusReAuthInterval, lan);
}
add(arWanConnHostName);
add(arWiFiEnableRadio);
//
//
//firewall_ddns
add(arFWDDNSEnable);
add(arFWDDNSType);
add(arFWDDNSUserHame);
add(arFWDDNSPassword);
add(arFWDDNSDomainName);
//firewall_dmz
add(arFWEnableDMZ);
add(arFWIPAddrDMZ);
//firewall_ip
addTable(true, [
    arFWIPFilterStartType,
    arFWIPFilterStartAddr,
    arFWIPFilterEndType,
    arFWIPFilterEndAddr,
    arFWIPFilterPortStart,
    arFWIPFilterPortEnd,
    arFWIPFilterProtoType,
    arFWIPFilterDesc,
    arFWIPFilterTOD
]);
//firewall_port
addTable(true, [
    arFWPortTrigDesc,
    arFWPortTrigPortStart,
    arFWPortTrigPortEnd,
    arFWPortTrigProtoType,
    arFWPortTargPortStart,
    arFWPortTargPortEnd    ]);
////firewall_settings
add(arFWEnabled);
add(arFWIPFloodDetect);
add(arFWIPSecPassThru);
add(arFWPPTPPassThru);
add(arFWL2TPPassThru);
add(arFWAllowICMP);
//firewall_url
add(arEnableParentalCont);
addTable(true, [ arTrustedDeviceMAC ]);
addTable(true, [
    arKeywordBlkWord,
    arKeywordBlkTOD
]);
addTable(true, [
    arBlackListDomain,
    arBlackListTOD
]);
//firewall_virt
addTable(true, [
    arFWVirtSrvDesc,
    arFWVirtSrvPortStart,
    arFWVirtSrvPortEnd,
    arFWVirtSrvProtoType,
    arFWVirtSrvIPAddrType,
    arFWVirtSrvIPAddr,
    arFWVirtSrvLocalPortStart,
    arFWVirtSrvLocalPortEnd
]);



//lan_dhcp
addTable(false, [
        arLanClientMAC,
                arLanClientType // must be 5 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!5 // unknown(0), dynamic(1), static(5)
        ], function(row) { return row[1] == 5; });



//lan_settings
add(arLanGatewayIp, lan);
add(arLanSubnetMask, lan);
add(arLanVLanID, lan);
add(arLanUseDHCP, lan);
add(arLanStartDHCP, lan);
add(arLanEndDHCP, lan);
add(arLanDomainName, lan);
add(arLanRateLimit, lan);
add(arLanDownRateLimit, lan);
add(arLanUpRateLimit, lan);
add(arLanRelayDNS, lan);

add(arLanOverrideDNS, lan);
addTable(false, [arLanDNSIPAddrType, arLanDNSIPAddr], function (row,key) { return (""+key).startsWith("12"); });
add(arLanUPnPEnable, lan);
add(arLanPassThru, lan);
//util_logconf
add(arEmailAddress);
add(arEmailServerName);
add(arEnableLogEmail);
// !!! arEmailApplySettings.set(1); at end
//util_systems
add(arAdminTimeout);
add(arEnableSNTP);
addTable(true, [arSNTPServerName,arSNTPServerAddr ]);
// wan

var wanType = arWanConnType.get() == 1; //unknown(0), dynamic(1), static(2), l2tpStatic(5), l2tpDynamic(6)
add(arWanConnType);
if (wanType == 1) { // dynamic
    // nothing
}
if (wanType == 2) { //static
    add(arWanStaticIPAddr, 1);
    add(arWanStaticPrefix, 1);
    add(arWanStaticGateway, 1);
    addTable(false, [arWanStaticDNSIPAddr]);
    add(arWanMTUSize);
    add(arWanConnDomainName);
}
if (wanType == 3) { //l2tp
    add(arWanTunnelHostName);
    add(arWanUserName);
    add(arWanPassword);
    add(arWanTunnelAddr);
    add(arWanEnableIdleTimeout);
    add(arWanIdleTimeout);
    add(arWanEnableKeepAlive);
    add(arWanKeepAliveTimeout);
}
//wan_routing
var EnableDynamicRoutingRIP = arRIPEnable.get() == 1;
var RoutedSubnetEnabled = arRIPRoutedSubnetEnabled.get() == 1;
add(arRIPEnable);
if (EnableDynamicRoutingRIP) {
    add(arRIPIPAddr);
    add(arRIPAuthEnable);
    add(arRIPAuthKeyChain);
    add(arRIPAuthKeyString);
    add(arRIPAuthKeyID);
}

add(arRIPRoutedSubnetEnabled);
if (RoutedSubnetEnabled) {
    add(arRIPRoutedSubnetIPType); // ipv4
    add(arRIPRoutedSubnetIP);
    add(arRIPRoutedSubnetGWNetIP);
    add(arRIPRoutedSubnetMask);
    add(arRIPRoutedSubnetDHCP);
    add(arRIPRoutedSubnetNAT);
}
// wifi_adv
add(arWiFiMode);
add(arWiFiBGProtect);
add(arWiFiBeaconInterval);
add(arWiFiDTIMInterval);
add(arWiFiRTSThreshold);
add(arWiFiFragmentThresh);
add(arWiFiShortRetryLimit);
add(arWiFiFrameBurst);
add(arWiFiHTMode);
add(arWiFiChannelBW);
add(arWiFiHTMCS);
add(arWiFiAMSDUEnable);
add(arWiFiDeclinePeerBA);
add(arWiFiBlockAck);
add(arWiFiGuardInterval);
add(arWMMAPSD);
add(arWiFiEnableRadio);
// wifi_mac
add(arBssAccessMode,"12");
addTable(true, [arMACAccessAddr]);



oids.push(saveVersion);


_.each(oids, function(l) { $.log(l); });

if (0) {
    while (localStorage.key(0))
        localStorage.removeItem(localStorage.key(0));
    var i = 10000;
    _.each(oids, function(l) { localStorage[i++] = l });
}

    var data = Base64.encode(JSON.stringify(oids));
    data = "--- Router Data For Backup: "+new Date()+"<![CDATA["+data+"]]> End Router Data ---";
    if (post) {
        $.ajaxSetup({async:false});
        $.post("hold", " "+data);
    }
    return data;
}

function stripComments(s) {
    var start = s.indexOf("<![CDATA[");
    var end = s.indexOf("]]>");
    if (start == -1 || end == -1)
        throw xlate("Invalid data.");
    s = s.substring(start+9, end).trim();
    return s;
}

function dorestore(rv) {
    if (rv === undefined) {
        rv = "";
        jQuery.ajax({
            url:    "router.data",
            success: function(result) {
                rv = result;
            },
            dataType : "text",
            async:   false,
            cache: false
        });
    }
    rv = stripComments(rv);
    rv = JSON.parse(Base64.decode(rv));
    loadRowStatus();

    if (rv.length < 2 || rv[0] !== saveVersion || rv[rv.length-1] !== saveVersion)
        throw "bad version";

    _.each(rv, function(a) {
        $.log(a);
        eval(a);
    });

//    for (var i=10000;;i++) {
//        if (!localStorage[i])
//            break;
//        $.log(localStorage[i]);
//        eval(localStorage[i]);
//    }
    snmpSet1(arApplyAllSettings.oid+".0", "1", "2");
}

