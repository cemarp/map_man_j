import SwiftUI

@main
struct MacMonitorApp: App {
    @StateObject private var viewModel = AppViewModel()

    var body: some Scene {
        WindowGroup {
            if viewModel.isHelperInstalled {
                DashboardView(viewModel: viewModel)
            } else {
                VStack(spacing: 20) {
                    Text("Helper Tool Required")
                        .font(.title)

                    Text("To read advanced hardware metrics and control battery charging limits, MacMonitor needs to install a privileged helper tool.")
                        .multilineTextAlignment(.center)
                        .padding()

                    Button("Install Helper Tool") {
                        viewModel.installHelper()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(width: 400, height: 300)
            }
        }
        .windowResizability(.contentSize)
    }
}
