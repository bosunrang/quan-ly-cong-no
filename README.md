# Quản lý công nợ phải thu

Ứng dụng tra cứu sổ chi tiết bán hàng xuất từ MISA.

## Công nghệ

- Electron cho ứng dụng Windows.
- React + TypeScript cho giao diện.
- Vite cho môi trường phát triển và build.
- Mọi giao diện gọi HTTP tới máy chủ; bản desktop tự chạy máy chủ loopback hoặc LAN và lưu SQLite.
- Dữ liệu được truy cập qua repository theo từng domain; mọi chế độ đều bắt buộc đăng nhập.

## Chạy giao diện khi phát triển

```powershell
pnpm install
pnpm dev
```

Mở `http://127.0.0.1:5176`. Vite tự đăng nhập quản trị khi chưa có phiên và chỉ cho phép
tự đăng nhập từ cùng địa chỉ cục bộ. Kho dev ở `data/dev/cong-no.sqlite`. Nếu kho chưa có
quản trị viên đã sẵn sàng, lần tự đăng nhập đầu sẽ tạo tài khoản `dev-admin` với mật khẩu ngẫu nhiên.
Đặt `CONG_NO_DEV_DATA_DIR` để chọn kho phát triển khác.

Để thử màn đăng nhập thủ công, khởi động Vite với `$env:CONG_NO_DEV_AUTO_LOGIN = '0'` và
mở cửa sổ InPrivate. Với kho trống, chạy `pnpm dev:init-admin` trước để lấy mật khẩu tạm.

`pnpm build` rồi `pnpm preview` để thử bản build qua HTTP với cùng kho phát triển.
Bản mở trực tiếp bằng `file://` và chế độ lưu nghiệp vụ trên trình duyệt đã được bỏ.

## Chạy qua mạng nội bộ trên ba máy chủ

| Công ty | Cổng | Địa chỉ từ máy khác trong LAN | Tệp SQLite |
| --- | ---: | --- | --- |
| Nam Hưng Việt | 3300 | `http://<IP-máy-chung>:3300/` | `cong-no-nam-hung-viet.sqlite` |
| Naviva Group | 3301 | `http://<IP-máy-chung>:3301/` | `cong-no-naviva-group.sqlite` |
| Tường Khuê | 3300 | `http://<IP-máy-Tường-Khuê>:3300/` | `cong-no-tuong-khue.sqlite` |
| Winbio | 3300 | `http://<IP-máy-Winbio>:3300/` | `cong-no-winbio.sqlite` |

### Vận hành bằng bản cài Windows

Tạo bộ cài bằng `pnpm dist` trên máy build. Tệp `Quan-Ly-Cong-No-Setup-<phiên-bản>.exe` được tạo trong `release`. Cài trên các máy chủ cần chạy app.

Khi mở ứng dụng (giống app cước phí), hộp **Chọn công ty** chỉ có bốn công ty và **Thoát**; công ty mở lần
trước được chọn sẵn. Lần đầu mở một công ty trên máy, app hỏi **Máy chủ** (lưu SQLite, phục vụ các máy
trong mạng) hay **Máy trạm** (chỉ kết nối tới máy chủ) và ghi nhớ cho các lần sau.

- **Máy chung**. Mở **Quản lý công nợ**, chọn **Nam Hưng Việt** → **Máy chủ**. Mở lại ứng dụng và chọn **Naviva Group** → **Máy chủ**. Windows hiển thị hai biểu tượng dưới khay; rê chuột lên mỗi biểu tượng để xem tên công ty và cổng.
- **Máy Tường Khuê**. Mở ứng dụng và chọn **Tường Khuê** → **Máy chủ**.
- **Máy Winbio**. Mở ứng dụng và chọn **Winbio** → **Máy chủ**.

Lần đầu mở một công ty ở chế độ máy chủ, app tự tạo tài khoản quản trị `admin` với mật khẩu mặc định `admin` (như app cước phí) và hiện thông báo kèm địa chỉ cho máy nhân viên. Ở lần đăng nhập đầu, app bắt đặt mật khẩu riêng trước khi xem hay sửa dữ liệu, nên hãy đăng nhập và đổi mật khẩu ngay sau khi cài.

Bấm **X** để ẩn cửa sổ xuống khay và giữ máy chủ chạy. Bấm đúp biểu tượng để mở cửa sổ. Trong menu chuột phải, chọn **Địa chỉ cho máy nhân viên…** để xem địa chỉ kết nối. Chọn **Thoát và dừng máy chủ** để kết thúc máy chủ của công ty đó.

Trên bản đã cài, tick **Khởi động cùng Windows** ở biểu tượng của từng công ty cần chạy. Máy chung cần tick cả hai biểu tượng. Sau khi đăng nhập vào tài khoản Windows đã bật tùy chọn, mỗi công ty lên thẳng dưới khay. Mở thủ công qua shortcut vẫn cho chọn công ty.

Bản thử một máy (`--local`, dùng cho lập trình qua `pnpm desktop`) không hiện trong hộp chọn công ty. Nó mở
tệp `cong-no.sqlite` của Electron qua máy chủ chỉ lắng nghe `127.0.0.1`, cũng yêu cầu đăng nhập; các bản
sao lưu JSON cục bộ cũ vẫn khôi phục được (`companyId: null`).

Bản cài lưu dữ liệu LAN tại `%APPDATA%\QuanLyCongNo\lan`. Nếu máy đã có dữ liệu LAN ở thư mục khác, đặt biến môi trường người dùng `CONG_NO_LAN_DATA_DIR` thành đường dẫn tuyệt đối của thư mục đó trước khi mở bản cài. Mục khởi động Windows ghi nhớ thư mục đang dùng khi bật tùy chọn.

### Chạy bằng lệnh hoặc thử từ mã nguồn

Trên máy chủ Windows dùng Node.js 22.13 trở lên và pnpm. Build lại sau khi cập nhật mã nguồn. Bản build gồm giao diện và module nghiệp vụ dùng trên máy chủ.

```powershell
pnpm install
pnpm build
```

Trên mỗi máy, chạy lệnh `lan:init-admin` một lần cho từng công ty do máy đó phục vụ. Lệnh in tên đăng nhập `admin` và một mật khẩu tạm thời. Người dùng đổi mật khẩu khi đăng nhập lần đầu. Chạy lệnh `lan` mỗi khi cần khởi động máy chủ.

Mỗi lệnh `lan` chạy đúng một công ty trên cổng riêng của công ty đó; luôn ghi rõ `--company`.

**Máy chung của Nam Hưng Việt và Naviva Group** (hai tiến trình, mỗi tiến trình một cửa sổ dòng lệnh)

```powershell
pnpm lan:init-admin --company=nam-hung-viet
pnpm lan:init-admin --company=naviva-group
pnpm lan --company=nam-hung-viet
```

```powershell
pnpm lan --company=naviva-group
```

**Máy riêng của Tường Khuê**

```powershell
pnpm lan:init-admin --company=tuong-khue
pnpm lan --company=tuong-khue
```

**Máy riêng của Winbio**

```powershell
pnpm lan:init-admin --company=winbio
pnpm lan --company=winbio
```

Mỗi địa chỉ mở thẳng công ty tương ứng. Thêm `--loopback` sau lệnh `pnpm lan` để chỉ mở trên máy chủ khi kiểm tra.

Để chạy thử giao diện máy chủ dưới khay từ mã nguồn, dùng `pnpm desktop:lan --company=nam-hung-viet --loopback` sau khi build. Thoát máy chủ đang dùng cùng cổng trước khi đổi cách chạy.

Giữ tiến trình máy chủ chạy trong thời gian sử dụng. Máy trạm trong LAN dùng HTTP với IP và cổng của máy chủ. Nếu Windows Firewall chặn kết nối, cho phép cổng TCP cần dùng trên mạng **Private**, giới hạn trong mạng nội bộ. Nếu muốn dùng HTTPS trực tiếp trong LAN, mở máy chủ với `--require-tls` và đặt `CONG_NO_LAN_TLS_KEY` cùng `CONG_NO_LAN_TLS_CERT` thành đường dẫn tệp PEM của khóa và chứng chỉ được máy trạm tin cậy.

Mỗi kho chứa riêng sổ MISA, công nợ, khoản thu, phân bổ, khách hàng, phân công, cài đặt, tài khoản và nhật ký. Kho LAN bắt đầu trống. Dữ liệu đã nhập ở cổng `5176` hoặc trong bản desktop vẫn nằm tại kho cũ. Nhập sổ MISA đúng công ty sau khi đăng nhập vào kho tương ứng.

Lệnh chạy từ mã nguồn lưu các tệp trong `data/lan` mặc định. Có thể đặt biến `CONG_NO_LAN_DATA_DIR` thành một thư mục cố định trên máy chủ trước khi khởi tạo quản trị và chạy app.

### Sao lưu và khôi phục theo công ty

Schema SQLite hiện tại là **14**. Khi mở kho cũ, máy chủ tạo bản sao trước khi nâng cấp;
bước v14 chuyển tài khoản và quyền vào `users`/`user_pages`, đồng thời tạo bảng `sessions`
để giữ phiên đăng nhập còn hiệu lực qua những lần khởi động lại máy chủ. Định dạng sao lưu JSON
nghiệp vụ vẫn là phiên bản 1; tài khoản và phiên đăng nhập không nằm trong tệp JSON này.

Trong **Cài đặt → Quản trị dữ liệu**, dùng **Xuất sao lưu** và **Nhập sao lưu** để lưu hoặc khôi phục dữ liệu nghiệp vụ bằng tệp JSON. Bản sao LAN chỉ nhập được vào đúng công ty. Tệp chứa sổ MISA, khoản thu, phân bổ, khách hàng, nhân viên và cài đặt doanh nghiệp. Tài khoản và nhật ký nằm ngoài dữ liệu nhập. Dùng **Xóa dữ liệu** để chọn từng nhóm. Với sổ MISA đã có phân bổ hoặc khách hàng đã có khoản thu, chọn cả nhóm **Khoản thu và phân bổ** khi xóa dữ liệu liên quan.

Máy chủ LAN tạo một bản SQLite mỗi ngày khi đang chạy và giữ 14 bản gần nhất trong `backups/<mã-công-ty>` thuộc thư mục dữ liệu LAN. Quản trị viên có thể dùng **Bản sao lưu tự động → Chọn bản sao lưu** để khôi phục ngay trong app. Trước khi khôi phục hoặc xóa theo nhóm, máy chủ lưu thêm một tệp JSON trong cùng thư mục và giữ 5 bản gần nhất. Trên bản Windows, dùng **Mở thư mục sao lưu…** dưới khay hệ thống để lấy các tệp này.

Bản desktop chạy cục bộ cũng giữ 14 bản SQLite theo ngày tại thư mục `backups/local` trong thư mục dữ liệu của ứng dụng (`%APPDATA%`). Trước khi xóa hoặc khôi phục dữ liệu, app lưu thêm một tệp JSON đầy đủ ở cùng thư mục. Khi nâng cấp cấu trúc SQLite, app tạo bản sao `*.truoc-nang-cap-v<phiên-bản>-<thời-điểm>.sqlite` cạnh tệp dữ liệu.

## Chạy bản desktop

```powershell
pnpm desktop
```

Lệnh trên build giao diện rồi mở ứng dụng Electron.

## Dùng Electron làm máy trạm

Mở bản cài, chọn công ty, chọn **Máy trạm** (chỉ hỏi lần đầu), rồi nhập địa chỉ máy chủ do quản trị viên cung cấp
(ví dụ `http://192.168.1.20:3300` trong LAN hoặc `https://congno.example.com` từ xa).
Địa chỉ được lưu cho các lần mở tiếp theo. Giống máy chủ, máy trạm có biểu tượng dưới khay: bấm **X** chỉ ẩn cửa sổ,
bấm đúp biểu tượng để mở lại. Menu chuột phải có **Đổi máy chủ…**, **Kết nối lại**, **Mở bằng trình duyệt** và **Thoát**.
Cửa sổ dùng giao diện, tài khoản và dữ liệu do máy chủ cung cấp.

Vai trò được nhớ theo từng công ty trong `lan-profiles/<mã-công-ty>/machine.json` (thư mục dữ liệu của app);
xóa tệp này để được hỏi lại. Có thể mở thẳng chế độ máy trạm với `--client` hoặc `--client --server-url=https://congno.example.com`
sau tên tệp `.exe`. Từ mã nguồn, dùng `pnpm start --client`.

## Truy cập từ xa qua Cloudflare Tunnel

1. Mở app ở chế độ **Máy chủ** cho đúng công ty. Máy chủ mặc định dùng HTTP cho cả LAN và connector
   Cloudflare, kể cả khi máy vẫn còn đường dẫn chứng chỉ nội bộ. Nếu shortcut hoặc tùy chọn khởi động
   cũ có `--tunnel`, `--loopback` hoặc `--require-tls`, bỏ cờ đó để dùng HTTP cho cả LAN và tunnel.
   Chọn `--loopback` nếu muốn cổng HTTP chỉ mở trên máy chủ.
2. Chạy `cloudflared` trên cùng máy. Thêm một hostname công khai cho mỗi công ty, giữ **Additional settings**
   mặc định và trỏ **Service** về `http://127.0.0.1:3300` đối với Nam Hưng Việt, hoặc cổng của công ty tương ứng.
   Giới hạn cổng HTTP trong firewall để máy trạm truy cập từ LAN. Nếu mở máy chủ với `--require-tls`,
   dùng Service `https://` và cấu hình để connector tin chứng chỉ của máy chủ.
   Tùy chọn cũ `--tunnel-origin` vẫn dùng được để giới hạn tunnel vào một tên miền cụ thể.
3. Bật chuyển hướng HTTP sang HTTPS ở Cloudflare. Thiết lập Cloudflare Access cho nhân viên được phép truy cập
   nếu cần lớp xác thực bên ngoài. Nếu Access chuyển qua tên miền của nhà cung cấp danh tính,
   dùng trình duyệt để hoàn tất đăng nhập. Công nợ tiếp tục xác thực và kiểm tra quyền tại máy chủ.

## Nhật ký và cập nhật Windows

Mở **Mở thư mục nhật ký…** từ biểu tượng dưới khay của máy chủ hoặc máy trạm. Máy chủ ghi trong
`logs/<mã-công-ty>` dưới thư mục dữ liệu, bản cục bộ trong `logs/local`, máy trạm trong
`workstation/logs` dưới thư mục dữ liệu người dùng. Lỗi khởi động desktop nằm trong `logs/desktop`.
Các tệp theo ngày UTC, giữ 30 ngày, tối đa 5 MB mỗi ngày.

`pnpm dist` tạo bộ cài Windows có sẵn kênh cập nhật từ
[GitHub Releases](https://github.com/bosunrang/quan-ly-cong-no/releases). Cài bộ cài từ đây lần đầu
để nhận các bản mới; bản cài cũ chưa có kênh cập nhật cần cài lại một lần.

GitHub Actions tự kiểm tra mã nguồn trên mỗi lần đẩy `main` và mỗi pull request. Khi đẩy tag
`v<phiên-bản>`, workflow **Phát hành Windows** kiểm tra tag trùng `package.json`, chạy toàn bộ test,
build bộ cài x64, kiểm tra Electron và mã SHA-512, rồi đăng `.exe`, `.exe.blockmap` và `latest.yml`
vào cùng một Release. Release chỉ được công bố sau khi tải đủ tệp. Node.js 24 và pnpm 11.25.0
được dùng trên runner Windows; thư viện được cài bằng `pnpm install --frozen-lockfile`.

Sau khi commit thay đổi và tăng phiên bản, phát hành lần đầu bằng tag tương ứng, ví dụ:

```powershell
git push origin HEAD:main
git tag v0.1.3
git push origin v0.1.3
```

Các lần tiếp theo có thể dùng `npm version patch` để tăng phiên bản, commit và tạo tag, rồi
`git push origin HEAD:main --follow-tags`. Có thể chạy lại workflow từ trang **Actions** với tag đã có;
workflow chỉ tiếp tục bản nháp chưa công bố, không ghi đè phiên bản đã phát hành.

Workflow dùng `GITHUB_TOKEN` có sẵn của repository để đăng Release, không cần token riêng.
Nếu có chứng thư ký mã Windows, thêm secrets `WINDOWS_CSC_LINK` (URL hoặc nội dung base64 của tệp PFX)
và `WINDOWS_CSC_KEY_PASSWORD` (mật khẩu PFX) để electron-builder ký bộ cài. Khi chưa cấu hình chứng thư,
bộ cài vẫn được phát hành như app cước phí nhưng chưa có chữ ký nhà phát hành Windows.

Để dùng nguồn HTTPS riêng có ký mã thay GitHub, đặt cả `CONG_NO_UPDATE_URL` và
`CONG_NO_UPDATE_PUBLISHER` khớp chứng thư khi build. Chế độ này bắt buộc ký mã; tải bộ cài,
`.blockmap` rồi `latest.yml` lên nguồn riêng. Giữ cùng danh tính nhà phát hành giữa các bản có ký.
[Hướng dẫn auto-update của electron-builder](https://www.electron.build/docs/features/auto-update/)

Bản Windows kiểm tra sau khi mở và mỗi 6 giờ, tải nền rồi hỏi trước khi cài. Chọn **Để sau** để
tiếp tục làm việc; có thể cài sau bằng **Cài bản cập nhật…** trên máy trạm hoặc trong menu khay.
Trên máy chạy nhiều công ty, đóng các phiên công ty còn lại trước khi cài vì bộ cài
dùng chung. App dừng máy chủ, chờ tác vụ sao lưu đang chạy kết thúc rồi khởi động trình cài.

## Kiểm tra chất lượng

```powershell
pnpm check
pnpm test:coverage
pnpm build
pnpm test:desktop
pnpm test:golden
pnpm test:performance
```

`pnpm check` chạy lint, typecheck và các test tự động. `pnpm test:golden` đối chiếu số tiền mẫu qua API. `pnpm test:performance` đo thời gian và dung lượng phản hồi trên kho tạm 50.000 dòng. Báo cáo coverage HTML được tạo tại `coverage/index.html`.
Sau `pnpm dist`, chạy `pnpm test:release` để kiểm tra nội dung bộ cài, kênh cập nhật GitHub và
độ khớp phiên bản, kích thước, SHA-512 giữa bộ cài và `latest.yml`. Workflow phát hành chạy bước này tự động.

## Quy ước kiến trúc

- `app`: điều phối màn hình và layout cấp ứng dụng.
- `features`: giao diện và use case theo từng nghiệp vụ; không nhập chéo feature.
- `domain`: model, repository và dịch vụ nghiệp vụ; không phụ thuộc giao diện.
- `shared`: tiện ích và UI dùng chung; không phụ thuộc `domain`, `features` hoặc `app`.
- Màu giao diện chỉ được khai báo trong `src/styles/foundation/tokens.css`.

Các quy tắc trên cùng cấu hình sandbox, CSP và giới hạn điều hướng Electron được bảo vệ bằng test trong `tests/architecture.test.ts`.

## Nhập dữ liệu MISA

Trong **Dữ liệu MISA**, chọn file Excel **Sổ chi tiết bán hàng**, kiểm tra các dòng xem trước rồi xác nhận nhập. App hiển thị 10 cột từ file và cho phép tìm theo chứng từ, hóa đơn, tên khách hàng hoặc tên hàng. Có thể nhập từng kỳ vì app bổ sung dữ liệu vào sổ hiện có, bỏ qua dòng trùng và đánh dấu các dòng xung đột với bản đã lưu.

## Chuyển danh mục khách hàng giữa các công ty

Trong **Khách hàng**, chọn **Xuất danh mục** để tải file `.xlsx` của danh sách đang lọc.
Chuyển sang công ty nhận, chọn **Nhập Excel** và kiểm tra bản xem trước trước khi xác nhận.
File giữ mã MISA, tên, địa chỉ, tỉnh/thành, MST, phân loại Nhà nước/Tư nhân, thời hạn công nợ
(kể cả 0 ngày), trạng thái và nhân viên phụ trách cùng ngày bắt đầu phụ trách.

Quản trị viên có thể nhập kèm phân công. App ghép nhân viên theo mã; file cũ chỉ có tên thì
ghép khi tên đầy đủ là duy nhất. Mã/tên mâu thuẫn, tên trùng hoặc nhân viên đã ngừng hoạt động
sẽ được báo để kiểm tra. Nhân viên chưa có được tạo trong cùng giao dịch nhập, chưa liên kết
tài khoản đăng nhập. Các ID và tài khoản đăng nhập của công ty nguồn không được sao chép.

Khách hàng đã có mã MISA tại công ty nhận được bỏ qua. File cũ thiếu thời hạn hoặc trạng thái
vẫn nhập được: chưa thiết lập thời hạn, mặc định đang hoạt động. Nếu không có ngày bắt đầu
phụ trách, app dùng ngày nhập danh mục.

## Thời hạn công nợ theo khách hàng

Danh mục khách hàng và file xuất danh mục hiển thị **Thời hạn công nợ**. Mở hồ sơ khách hàng → **Chỉnh sửa hồ sơ** để nhập số ngày; nhập 0 để đến hạn ngay hoặc để trống nếu chưa có thời hạn.

Sau khi lưu, hóa đơn cũ và mới tự tính hạn thanh toán từ ngày hóa đơn (thiếu thì dùng ngày chứng từ), đồng thời cập nhật số ngày quá hạn và tuổi nợ. Hóa đơn đã đặt hạn thanh toán riêng giữ nguyên ngày đã chọn.

## Người dùng và nhật ký sử dụng

Với bản desktop cục bộ hoặc LAN, app tự tạo quản trị đầu tiên `admin` / `admin` khi kho chưa có tài khoản và bắt đổi mật khẩu ở lần đăng nhập đầu. Với máy chủ chạy bằng lệnh, dùng `lan:init-admin`. Kho phát triển có `dev:init-admin` để tạo tài khoản thủ công khi kho còn trống. **Quản trị** có quyền truy cập toàn bộ thẻ. Khi tạo hoặc sửa tài khoản **Nhân viên** hay **Chỉ xem**, chọn từng thẻ trong giới hạn của vai trò. Tài khoản cũ chưa có danh sách thẻ riêng dùng quyền mặc định của vai trò. Khóa tài khoản, đổi quyền truy cập hoặc đổi mật khẩu sẽ vô hiệu hóa phiên cũ của tài khoản đó.

Mật khẩu quản trị cấp khi tạo hoặc đặt lại cho người khác là mật khẩu tạm thời. Người dùng đăng nhập bằng mật khẩu đó, đặt mật khẩu riêng rồi mới vào các thẻ được cấp. Nhật ký ghi việc đổi mật khẩu mà không lưu nội dung mật khẩu.

**Nhật ký sử dụng** ghi người thực hiện, thời điểm và chi tiết các thao tác kể từ khi tính năng được triển khai. Quản trị có thể tìm kiếm, lọc theo người hoặc nhóm thao tác, rồi xuất kết quả CSV. Xóa dữ liệu nghiệp vụ giữ lại tài khoản và nhật ký.

Máy chủ LAN xác thực tài khoản và lưu nhật ký tập trung trong kho của công ty đang mở.

## Quy tắc giao diện

Kích thước và màu trạng thái nằm trong `src/styles/foundation/tokens.css`, theo ba nhóm của QC Lab gồm thang nền tảng, vai trò giao diện và thành phần. CSS trang lấy màu, khoảng cách, kích thước cố định, bo góc và viền qua `var(--…)`. Các trang dùng quy tắc trong `src/styles/shared/controls.css` và các thành phần ở `src/shared/ui`.

Giữ điều kiện đổi bố cục trong `@media` vì truy vấn kích thước CSS không đọc biến tùy chỉnh. Vị trí popup và độ dài thanh tiến độ được tính từ kích thước thực tế hoặc dữ liệu đang hiển thị.

| Thành phần | Quy tắc |
| --- | --- |
| Chữ | Chú thích 11–12 px, nội dung bảng 13 px, ô nhập và nút 14 px, tiêu đề khối 16 px, tiêu đề trang 24 px. Token dùng `rem` để tôn trọng cỡ chữ trình duyệt. |
| Ô nhập và ngày | Cao 36 px. Dùng 32 px cho điều khiển phân trang và nút trong hàng, 28 px cho nút đóng thông báo. Nhãn cách ô 6 px, các trường cách nhau 16 px. |
| Dropdown | Dùng `select` gốc cho danh sách bộ lọc. Trình duyệt hỗ trợ `base-select` dùng bảng chọn có cùng viền, bo góc, giới hạn chiều cao và trạng thái chọn với bộ gợi ý tìm kiếm. Dùng `SearchableInput` cho danh sách cần tìm theo chữ, như tỉnh/thành. |
| Focus | Bấm ô nhập hoặc nút hành động bằng chuột làm đổi màu viền. Khi dùng bàn phím, điều khiển có vòng focus 2 px. Vòng nằm trong viền ô nhập và bao quanh cả khung của ô có biểu tượng. Dùng vòng sáng trên nền tối và màu lỗi cho trường `aria-invalid`. |
| Nút chính và nút phụ | Dùng `button primary` cho hành động chính như Lưu, Xác nhận và Nhập MISA. Khi rê chuột, nút chuyển xanh đậm, đổ bóng và nhấc 1 px. Dùng `button secondary` cho Hủy, Quay lại và hành động phụ. Nút phụ đổi nền, viền, chữ và bóng nhẹ. Cả hai dùng chung một quy tắc ở trang, hộp thoại và ngăn chi tiết. |
| Di chuột và nhấn | Nút Xóa dùng bóng đỏ. Nút cảnh báo nhấn viền vàng. Nút biểu tượng, phân trang, dropdown, lịch và hàng bảng phản hồi bằng màu. Thẻ chọn dùng viền và bóng nhẹ. Khi nhấn, nút có hiệu ứng nhấc trở về vị trí ban đầu và bóng tắt. Chuyển tiếp dùng token 150 ms và tôn trọng thiết lập giảm chuyển động. |
| Vô hiệu hóa | Dùng thuộc tính `disabled` gốc. Nút dùng độ mờ 45% và con trỏ không cho phép thao tác. Ô nhập và dropdown bị khóa dùng nền nhạt, viền và chữ mờ. |
| Thanh cuộn | Cuộn dọc và ngang dùng cùng token màu. Trên Chromium, cả hai trục dùng 10 px. Các bảng tự cuộn, giữ chỗ cho thanh cuộn dọc và giữ tiêu đề khi cần. |
| Bảng | Header và hàng thường tối thiểu 40 và 44 px. Bảng xem trước dùng 30 và 36 px. Hàng có ô nhập dùng tối thiểu 52 px. Nội dung nhiều dòng được xuống dòng. Các cột tiền trong bảng công nợ và đối soát căn giữa, các cột tiền trong sổ MISA căn phải. |
| Xóa | Dùng `RowActionButton` trong danh sách hoặc nút viền đỏ khi có nhãn. Mở `Dialog` với `tone="danger"`, nêu tên đối tượng và ảnh hưởng. Đặt **Hủy** trước nút đỏ xác nhận, với tiêu điểm ban đầu ở **Hủy**. Dùng màu cảnh báo cho ngừng hoạt động và bỏ phân công. |
| Hộp thoại và ngăn chi tiết | Dùng `Dialog` hoặc `Drawer`. `Tab` đi trong khung đang mở. Khi mở lịch, focus chuyển vào lịch. `Esc` đóng lịch hay bộ chọn trước và trả focus về điều khiển tương ứng. Lần `Esc` tiếp theo mới đóng hộp thoại. |
| Thông báo | Dùng `Notice` với mức thành công, thông tin, cảnh báo hoặc lỗi. Hiển thị lỗi và cảnh báo tại phần nội dung liên quan. Dùng thông báo nổi cho phản hồi sau thao tác và luôn có nút đóng. |
| Kiểu mới | Ưu tiên token và thành phần sẵn có. Chỉ bổ sung kiểu riêng tại trang khi cần bố trí đặc thù như bảng MISA 10 cột. |
