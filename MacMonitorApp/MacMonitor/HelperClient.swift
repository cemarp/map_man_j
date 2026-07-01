import Foundation
import Combine

class HelperClient: ObservableObject {
    static let shared = HelperClient()

    private var connection: NSXPCConnection?

    init() {
        setupConnection()
    }

    private func setupConnection() {
        connection = NSXPCConnection(machServiceName: helperMachServiceName, options: .privileged)
        connection?.remoteObjectInterface = NSXPCInterface(with: MacMonitorHelperProtocol.self)

        connection?.interruptionHandler = { [weak self] in
            print("XPC Connection interrupted")
            self?.connection = nil
        }

        connection?.invalidationHandler = { [weak self] in
            print("XPC Connection invalidated")
            self?.connection = nil
        }

        connection?.resume()
    }

    private func getHelper() -> MacMonitorHelperProtocol? {
        if connection == nil {
            setupConnection()
        }
        return connection?.remoteObjectProxyWithErrorHandler { error in
            print("XPC Error: \(error)")
        } as? MacMonitorHelperProtocol
    }

    func fetchMetrics(completion: @escaping (SystemMetrics?) -> Void) {
        guard let helper = getHelper() else {
            completion(nil)
            return
        }

        helper.getMetrics { data, error in
            guard let data = data, error == nil else {
                print("Failed to fetch metrics: \(String(describing: error))")
                completion(nil)
                return
            }

            do {
                let metrics = try JSONDecoder().decode(SystemMetrics.self, from: data)
                completion(metrics)
            } catch {
                print("Failed to decode metrics: \(error)")
                completion(nil)
            }
        }
    }

    func updateBatteryState(_ state: BatteryControlState, completion: @escaping (Bool) -> Void) {
        guard let helper = getHelper() else {
            completion(false)
            return
        }

        do {
            let data = try JSONEncoder().encode(state)
            helper.updateBatteryControlState(data) { success, error in
                if let error = error {
                    print("Failed to update battery state: \(error)")
                }
                completion(success)
            }
        } catch {
            print("Failed to encode state: \(error)")
            completion(false)
        }
    }

    // In a real application, you would implement SMJobBless to install the helper tool.
    func installHelperTool(completion: @escaping (Bool) -> Void) {
        // Pseudo-code for SMJobBless implementation:
        // var authItem = AuthorizationItem(name: kSMRightBlessPrivilegedHelper, valueLength: 0, value: nil, flags: 0)
        // var authRights = AuthorizationRights(count: 1, items: &authItem)
        // ...
        print("Helper tool installation process would run here.")
        completion(true)
    }
}
