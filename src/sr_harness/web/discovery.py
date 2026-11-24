"""Seven scientific examples: comparison cards, read-only inputs and editable prompts."""
from __future__ import annotations

import os
from pathlib import Path

# Paper conclusions are display-only and are never used to build agent prompts.
CASES = [{'topic': 'Gaia',
  'name': 'Chen_NatureAstronomy2023',
  'title': 'The use of double-mode RR Lyrae stars as robust distance and metallicity indicators',
  'publisher_url': 'https://www.nature.com/articles/s41550-023-02011-y',
  'subject_zh': '双模 RR Lyrae 周期—周期比—金属丰度',
  'relation_zh': 'SDSS: [Fe/H] = -173*log10((P1O/PF)/0.745) - 6.62*log10(P1O/0.37) - 1.76；见 Eq.1 的不确定度。',
  'files': ['41550_2023_2011_MOESM1_ESM.txt'],
  'data_stage': '作者原始发布参数表 · 303 颗恒星',
  'task': '恒星的两种脉动周期与其金属含量之间有什么关系？',
  'description_zh': '这篇研究用 RR Lyrae 变星的两种脉动周期来估计恒星的金属含量和距离。SDSS 和 LAMOST '
                    '是两个提供恒星光谱测量的观测项目；本例检验金属含量估计，论文中的距离研究还使用了 Gaia 数据。',
  'description_en': 'This study uses the two pulsation periods of double-mode RR Lyrae stars to estimate '
                    'their metallicity and distance. This example focuses on metallicity measured by the '
                    'SDSS and LAMOST spectroscopic surveys; the distance calibration also uses Gaia.',
  'preparation': '观测表 {inputs} 中记录了具有两种脉动周期的 RR Lyrae 变星的周期、光谱金属丰度和天空位置，SDSS、LAMOST 标明观测来源。将它整理为系统接受的数据格式。每行一颗恒星。保留两种脉动周期、金属丰度及其误差、天空位置和巡天来源。统一并注明单位。标记并注明同一天体的重复记录和缺失值。',
  'evaluation': '构建用周期估计金属丰度的评测器。只用 SDSS 数据进行开发，按天体分成训练和验证集；LAMOST 作为最终独立检验，排除与 SDSS '
                '重复的天体，不用于拟合或选择候选。按金属丰度误差评分，并检查是否需要额外散布；额外散布只在训练集估计并固定。保存并测试评测器，说明训练、验证、独立检验的样本数及排序指标。'},
 {'topic': 'Gaia',
  'name': 'Xiang_Nature2022',
  'title': 'A time-resolved picture of our Milky Way’s early formation history',
  'publisher_url': 'https://www.nature.com/articles/s41586-022-04496-5',
  'subject_zh': '年龄—金属丰度及轨道作用量',
  'relation_zh': 'mean_age([Fe/H]) = age0 + a*[Fe/H]，厚盘窄年龄—金属丰度序列；不是全银河统一函数。',
  'files': ['41586_2022_4496_MOESM3_ESM.txt'],
  'data_stage': '作者发布恒星目录 · 年龄为模型推断量',
  'task': '银河系早期盘族群中，恒星年龄与金属含量之间有什么关系？',
  'description_zh': '这篇研究利用恒星的年龄、化学组成和银河系轨道，追溯银河系早期的形成历史。年龄与金属含量的窄序列属于特定的银河盘族群；目录中的年龄由模型估计，不能把所有恒星混在一起分析。',
  'description_en': 'This study reconstructs the early Milky Way using stellar ages, chemical abundances and '
                    'orbits. The narrow age–metallicity sequence belongs to a particular disc population, '
                    'and the catalogue ages are model estimates.',
  'preparation': '{inputs} 是 LAMOST 和 Gaia 的 24.7 万颗亚巨星，年龄是拿等年龄线估的。帮我整理一下：-9999 和 NaN 当缺失，单位照表头。只用年龄相对误差小于 15% 的星。再按 [α/Fe] 和轨道挑出早期的高 α 厚盘，别拿年龄和 [Fe/H] 来挑，这俩是要研究的量。写清楚筛选条件和每一步剩多少颗。分析表里只放这群星，其他星另存一份做对照。',
  'evaluation': '我想看这群星的年龄怎么随 [Fe/H] 变。年龄按它的误差加权，再留一个固有弥散。样本里会混进蓝离散星，留一个离群成分。随机留 30% 的星做检验。'},
 {'topic': 'Gaia',
  'name': 'Li_Nature2023',
  'title': 'Stellar initial mass function varies with metallicity and time',
  'publisher_url': 'https://www.nature.com/articles/s41586-022-05488-1',
  'subject_zh': '初始质量函数斜率随丰度/时代变化',
  'relation_zh': 'dN/dM ∝ M^(-alpha)，alpha 随金属丰度及恒星族群时代变化；0.3–0.7 Msun 范围。',
  'files': ['jdli22_imf.csv'],
  'data_stage': '作者发布恒星样本 · 需估计分布',
  'task': '恒星的质量分布如何随金属含量和族群形成时期变化？',
  'description_zh': '这篇研究考察不同化学组成、不同形成时期的恒星，其初始质量分布是否改变。本例提供作者发布的恒星目录；质量分布要由一组恒星统计得到，还需考虑漏检和双星，不能从单颗恒星直接读取。',
  'description_en': 'This study asks whether the stellar initial mass distribution changes with chemical '
                    'composition and formation time. The example contains the published stellar catalogue; '
                    'recovering a population distribution requires selection and binary-star corrections.',
  'preparation': '恒星目录 {inputs} 中记录了恒星的质量估计、化学丰度、轨道信息和观测分组，还包含作者计算的局部数密度摘要 nu_i 及分箱标签。将它整理为系统接受的数据格式。每行一颗恒星，保留天体标识、质量及误差、化学丰度、轨道信息和观测分组。核实并注明 nu_i、mass_bin、mh_bin、jz_bin 的含义与区间边界。统一并注明单位，标记重复记录、缺失值，以及缺少的完备性和双星修正资料。',
  'evaluation': '先检查数据是否足以估计各族群的质量分布，核实 nu_i 的来源、区间宽度和所需修正。资料充分时，对质量区间的计数或测得的密度评分，按观测 plate '
                '分组验证并考虑测量误差；单颗恒星的质量不能作为质量分布斜率的标签。关键资料缺失时说明无法检验的目标，不改做其他预测。保存并测试可支持的评测器，说明排序指标。'},
 {'topic': 'FRB',
  'name': 'Feng_Science2022',
  'title': 'Frequency-dependent polarization of repeating fast radio bursts—implications for their origin',
  'publisher_url': 'https://www.science.org/doi/10.1126/science.abl7759',
  'subject_zh': '频率相关退偏振及磁离子环境参数关系',
  'relation_zh': 'p/p0 = exp(-2*sigma_RM^2*lambda^4)；再研究 sigma_RM 与 |RM|、散射时标的关系。',
  'files': [],
  'data_stage': '校准后的原始 PSRFITS · 37 份观测',
  'task': '重复快速射电暴发的偏振与观测频率及周围磁离子环境有什么关系？',
  'description_zh': '这篇研究考察重复快速射电暴发的偏振如何随频率改变，以了解爆发周围的磁场和电离气体。本例有 37 '
                    '份校准观测；偏振信号太弱时只能给出上限，同一天体的多次观测也不能当作完全独立的数据。',
  'description_en': 'This study measures how repeating fast radio bursts change their polarization with '
                    'frequency to probe nearby magnetized plasma. The example has 37 calibrated '
                    'observations; weak polarization may provide only limits, and bursts from the same '
                    'source are related.',
  'preparation': '观测目录 {inputs} 中的校准射电文件记录了重复快速射电暴发的信号在时间、频率和偏振通道上的变化。将它们整理为系统接受的数据格式。每行对应一次爆发的一个频率子带，保留频率、总强度、线偏振及误差、背景噪声，以及天体、观测和仪器标识。逐份核实偏振格式、数据轴和权重，不能假定四路数据都是 I、Q、U、V。统一并注明单位，标记未检出、上限和缺失值。',
  'evaluation': '构建频率分辨偏振测量的评测器，先在同一天体内比较，同一次观测的数据必须留在同一组。考虑测量误差和低信噪比上限，保留仪器及观测时段差异；不能把上限当作精确测量值。若尚不支持必要的上限处理，明确说明。保存并测试评测器，说明排序指标。'},
 {'topic': 'FRB',
  'name': 'Li_Nature2021',
  'title': 'A bimodal burst energy distribution of a repeating fast radio burst source',
  'publisher_url': 'https://www.nature.com/articles/s41586-021-03878-5',
  'subject_zh': '重复 FRB 的能量分布（扩展阅读）',
  'relation_zh': '爆发能量分布使用 log-normal 与 generalized Cauchy 组合描述。',
  'files': ['41586_2021_3878_MOESM3_ESM.csv'],
  'data_stage': '作者原始发布爆发表 · 1652 次爆发',
  'task': '这个重复暴的能量分布是什么形状？不同观测之间稳定吗？',
  'description_zh': '这篇研究分析同一重复快速射电暴发源的 1652 次爆发，研究能量如何分布，而非预测某一次爆发的能量。较弱的爆发可能漏检，因此需要检查探测阈值，以及不同观测时段之间的差异。',
  'description_en': 'This study examines the energy distribution of 1,652 bursts from one repeating source, '
                    'rather than predicting an individual burst. Weak events may be missed, so detection '
                    'limits and observing-session differences matter.',
  'preparation': '{inputs} 是 FAST 观测 FRB 20121102A 的 1652 个爆发。帮我整理一下：统一单位，按表注把括号里的误差拆出来，加一列 log10 能量。'
                 '爆发间隔超过 6 小时算一次新观测。再按观测和 0.1 dex 能量箱数一下爆发数，做成长表，空箱留着。表里没给曝光和探测阈值，别自己编。',
  'evaluation': '我只关心能量分布的形状，不管每次观测的爆发总数。用前 70% 爆发所在的观测来拟合，后面的观测来检验，一次观测别拆开。'},
 {'topic': 'ISM',
  'name': 'Chiang_NatureAstronomy2026',
  'title': 'Cosmic CO and [C\u2009II] backgrounds and the fuelling of star formation over 12\u2009Gyr',
  'publisher_url': 'https://www.nature.com/articles/s41550-026-02798-6',
  'subject_zh': '宇宙分子气体演化与恒星形成律',
  'relation_zh': 'Omega_H2(z)≈1.9e-4*(1+z)^2.3/[1+((1+z)/2.8)^6.5]；宇宙平均KS型关系指数约1.5。',
  'files': ['rho_CO_CII--8_z_bins.ecsv', 'rho_CO_CII--dense_z_fiducial.ecsv'],
  'data_stage': '作者发布统计测量与协方差 · 非原始全天图',
  'task': '宇宙中分子气体的总量怎么随红移变化？',
  'description_zh': '这篇研究综合不同宇宙时期的谱线背景测量，估计宇宙平均分子气体和恒星形成活动的演化。本例提供处理后的统计测量；从谱线信号推算气体量需要转换模型，不同参数的误差也可能相互关联。',
  'description_en': 'This study uses line-background measurements across cosmic time to infer the evolution '
                    'of molecular gas and star formation. This example provides processed statistics; '
                    'converting line signals to gas mass requires modelling and correlated uncertainties.',
  'preparation': '{inputs} 是宇宙 CO 和 [C II] 背景的光度密度。8_z_bins 那份是 8 个红移区间各自重拟合的结果，CO 是 9 条线加总。我要从 CO(1–0) 推出的 Ω_H2：1–0 占 9 条线的比例从 dense_z_fiducial 那份模型里取，那份只用来取比例，别当观测点。α_CO 取 3.6，宇宙学用 Planck 2018。上下误差分开留着。[C II] 这次不用。',
  'evaluation': '我想看 Ω_H2 怎么随红移变。只有 8 个红移区间，别再留出一部分，用逐个留一来检验。误差上下不对称，按各自的误差算。'},
 {'topic': 'ISM',
  'name': 'Kainulainen_Science2014',
  'title': 'Unfolding the laws of star formation: The density distribution of molecular clouds',
  'publisher_url': 'https://www.science.org/doi/10.1126/science.1248724',
  'subject_zh': '分子云体密度分布与恒星形成',
  'relation_zh': '从消光图重建体密度PDF，比较其宽度与恒星形成活动，并约束密度阈值/阈值以上效率。',
  'files': ['table_S1_transcribed.csv'],
  'data_stage': '论文观测表转录 · 非原始消光图',
  'task': '分子云的密度结构与其中的恒星形成活动有什么关系？',
  'description_zh': '这篇研究用分子云的消光图重建气体的空间密度分布，考察它与恒星形成的关系。本例只有论文观测表，不能重新验证从图像推断三维密度的步骤；表中的汇总行也不能当作独立分子云。',
  'description_en': 'This study reconstructs molecular-cloud volume densities from extinction maps and '
                    'relates them to star formation. This example contains the published observation table, '
                    'not the maps; combined rows are not independent clouds.',
  'preparation': '论文观测表 {inputs} 中记录了邻近分子云的体密度分布摘要、稠密气体质量和年轻恒星数量，这些是消光图分析得到的统计量，表中不含原图。将它整理为系统接受的数据格式。每行一个独立分子云，保留质量、密度摘要、恒星计数、误差和所属云复合体，排除汇总行。统一并注明单位，说明氢原子与氢分子密度的区别，标记重复记录、缺失值及缺少的原始图像。',
  'evaluation': '为现有参数表构建评测器，按独立云复合体留组验证，考虑测量误差并报告样本很少带来的不稳定性。不能用某个阈值计算出的质量反过来验证同一阈值。区分表格中的关联与原始密度重建；关键密度定义或原图缺失时说明主结论无法完整检验。保存并测试可支持的评测器，说明排序指标。'}]


def prompts(case, paths, system_prompt):
    """Keep measurement preparation, evaluation design and the research question separate."""
    inputs = '、'.join(path.name for path in paths) or '、'.join(case['files']) or '所提供的目录'
    preparation = case['preparation'].format(inputs=inputs)
    return {'data_agent': preparation, 'problem_description': case['task'],
            'evaluator_agent': case['evaluation'], 'system_prompt': system_prompt,
            'user_prompt': case['task']}


def project_root():
    configured = os.environ.get('ASTRAL_PROJECT_ROOT')
    if configured:
        return Path(configured).expanduser().resolve()
    for path in (Path.cwd(), *Path(__file__).resolve().parents):
        if (path / 'data').is_dir() and (path / 'pyproject.toml').exists():
            return path
    return Path.cwd()


def sources(case):
    root = project_root()
    if case['name'] == 'Feng_Science2022':
        candidates = [root / '.cache/replication_raw/ScienceDB',
                      root / 'data/spark04/FRB/Feng_Science2022/ScienceDB']
        for directory in candidates:
            if directory.is_dir() and len([p for p in directory.glob('*/*') if p.is_file() and p.suffix in {'', '.calibP'} and p.stat().st_size > 0]) == 37:
                return sorted(p for p in directory.iterdir() if p.is_dir())
        return []
    return [root / 'data' / case['topic'] / case['name'] / name for name in case['files']]


def ready(paths):
    return bool(paths) and all(p.is_file() and p.stat().st_size > 0 or
                               p.is_dir() and any(p.iterdir()) for p in paths)


def list_cases():
    return [{k: v for k, v in case.items() if k not in {'files', 'task', 'preparation', 'evaluation'}} |
            {'available': ready(sources(case))} for case in CASES]


def load_case(session, name):
    case = next((case for case in CASES if case['name'] == name), None)
    if case is None:
        raise ValueError('Unknown scientific discovery task')
    paths = sources(case)
    if not ready(paths):
        raise FileNotFoundError('任务数据尚未就绪；请先下载或接通原始数据目录。')
    with session.lock:
        if session.state != 'idle' or any(t and t.is_alive() for t in
                (session.data_thread, session.evaluator_agent_thread)):
            raise ValueError('请在空闲的新会话中加载科学发现任务。')
        context = session.workspace / 'context.data'
        if session.context.data or context.exists() and (not context.is_dir() or any(context.iterdir())):
            raise ValueError('当前已有处理后的数据，请新建会话后选择论文任务。')
        names = [p.name for p in paths]
        if len(names) != len(set(names)):
            raise ValueError('Task input names must be unique')
        for path in paths:
            logical = session.workspace / path.name
            if (logical.exists() or logical.is_symlink()) and not (
                    logical.is_symlink() and logical.resolve() == path.resolve()):
                raise FileExistsError(f'工作区已有同名文件：{path.name}；请新建会话。')
        preview = session.preview_initial_prompts({'problem_description': case['task']})
        drafted = prompts(case, paths, preview['system_prompt'])
        mounted = [session.workspace_manager.mount(path, readonly=True).name for path in paths]
        session.initial_prompt = drafted['problem_description']
        session.discovery_task = {'name': name, 'prompts': drafted}
        session.data_interaction_manager.publish_event('workspace_changed',
            {'operation': 'mounted', 'paths': mounted, 'read_only': True})
        return {'name': name, 'mounts': mounted, 'read_only': True, 'prompts': drafted}


def restore_mounts(session, name):
    """Restore only catalog-approved inputs, never arbitrary paths from a snapshot."""
    case = next((case for case in CASES if case['name'] == name), None)
    if case is None:
        raise ValueError('Unknown persisted scientific discovery task')
    paths = sources(case)
    if not ready(paths) or session.workspace_manager.read_only:
        return
    for path in paths:
        logical = session.workspace / path.name
        if logical.is_symlink() and logical.resolve() == path.resolve():
            session.workspace_manager.mount(path, readonly=True)
