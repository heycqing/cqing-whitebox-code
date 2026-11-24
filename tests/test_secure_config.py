"""
tests/test_secure_config.py

Python 单元测试：对 examples/secure-config.py 执行可执行断言：
1. 非法 tenant_id 拒绝断言（路径遍历、绝对路径、斜杠、空字符、特殊字符）
2. 合法 tenant_id 读取与真正不可变只读防护 (MappingProxyType)
3. 配置文件损坏时的 PEP 3134 因果链保留 (ConfigurationError.__cause__)
"""

import json
from pathlib import Path
import sys
import tempfile
import unittest

# 将根目录加入 sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# 直接导入被测模块
from importlib.machinery import SourceFileLoader
secure_config_path = REPO_ROOT / "examples" / "secure-config.py"
secure_config = SourceFileLoader("secure_config", str(secure_config_path)).load_module()

load_tenant_config = secure_config.load_tenant_config
ConfigurationError = secure_config.ConfigurationError


class TestSecureConfig(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_dir = Path(self.temp_dir.name)

        # 写入一个合法的租户配置
        self.valid_data = {
            "appName": "TenantOneApp",
            "maxUsers": 50,
            "features": ["billing", "analytics"],
            "database": {"host": "10.0.1.20", "port": 5432}
        }
        with open(self.config_dir / "tenant_001.json", "w", encoding="utf-8") as f:
            json.dump(self.valid_data, f)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_reject_unsafe_tenant_ids(self):
        """1. 严格拒绝各类路径遍历与非法 tenant_id"""
        unsafe_ids = [
            "..",
            "../evil",
            "evil/..",
            "..\\evil",
            "/etc/passwd",
            "C:\\boot.ini",
            "tenant/sub",
            "tenant\\sub",
            "tenant\0null",
            "",
            "   ",
            "tenant*wildcard",
            "tenant;injection",
            "a" * 65  # 超长 65 位
        ]

        for bad_id in unsafe_ids:
            with self.subTest(bad_id=bad_id):
                with self.assertRaises(ValueError, msg=f"Should reject unsafe tenant_id: {bad_id!r}"):
                    load_tenant_config(self.config_dir, bad_id)

    def test_load_valid_tenant_and_immutability(self):
        """2. 验证合法读取与真正的不可变只读约束 (MappingProxyType)"""
        config = load_tenant_config(self.config_dir, "tenant_001")
        self.assertEqual(config["appName"], "TenantOneApp")
        self.assertEqual(config["maxUsers"], 50)
        self.assertEqual(config["features"], ("billing", "analytics"))

        # 验证不可变：试图修改顶层属性必须抛出 TypeError
        with self.assertRaises(TypeError):
            config["appName"] = "HackedApp"

        # 验证嵌套不可变：试图修改深层 database 映射必须抛出 TypeError
        with self.assertRaises(TypeError):
            config["database"]["host"] = "192.168.0.1"

    def test_missing_file_raises_configuration_error(self):
        """3. 配置文件不存在时抛出结构化 ConfigurationError"""
        with self.assertRaises(ConfigurationError) as ctx:
            load_tenant_config(self.config_dir, "non_existent_tenant")
        self.assertIn("non_existent_tenant.json", ctx.exception.config_file)

    def test_corrupted_json_preserves_cause_chain(self):
        """4. 损坏 JSON 时保留底层 json.JSONDecodeError 作为 __cause__"""
        corrupted_path = self.config_dir / "corrupted_tenant.json"
        with open(corrupted_path, "w", encoding="utf-8") as f:
            f.write("{ invalid json")

        with self.assertRaises(ConfigurationError) as ctx:
            load_tenant_config(self.config_dir, "corrupted_tenant")

        # PEP 3134 因果链断言
        cause = ctx.exception.__cause__
        self.assertIsInstance(cause, json.JSONDecodeError)
        self.assertIn("Expecting property name enclosed in double quotes", str(cause))


if __name__ == "__main__":
    unittest.main()
