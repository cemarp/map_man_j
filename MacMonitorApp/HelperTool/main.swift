import Foundation

class HelperDelegate: NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
        // This is where you would verify the code signature of the connecting app
        // to ensure that only your main app can talk to your privileged helper tool.

        newConnection.exportedInterface = NSXPCInterface(with: MacMonitorHelperProtocol.self)
        newConnection.exportedObject = MacMonitorHelper()
        newConnection.resume()
        return true
    }
}

let delegate = HelperDelegate()
let listener = NSXPCListener(machServiceName: helperMachServiceName)
listener.delegate = delegate
listener.resume()

// Keep the tool running
RunLoop.main.run()
