import Foundation

@objc(MacMonitorHelperProtocol)
public protocol MacMonitorHelperProtocol {

    // Request current metrics. The helper tool will parse powermetrics and SMC.
    func getMetrics(withReply reply: @escaping (Data?, Error?) -> Void)

    // Update battery control settings. The helper will apply SMC limits.
    func updateBatteryControlState(_ stateData: Data, withReply reply: @escaping (Bool, Error?) -> Void)

    // Start continuous monitoring if needed, though polling from app might be easier.
    func getVersion(withReply reply: @escaping (String) -> Void)
}

public let helperMachServiceName = "com.yourdomain.MacMonitor.HelperTool"
